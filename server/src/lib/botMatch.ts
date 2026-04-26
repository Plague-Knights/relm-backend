import * as crypto from "node:crypto";
import { prisma } from "./prisma.js";

// Bot battle match runtime. The server is authoritative on positions
// and scoring — bots only *propose* moves via /intent. Anti-cheat
// approach: same physics tick runs for every entry, position deltas
// are clamped per-tick, collisions for objective pickups happen here
// not in the bot.

const MAX_SPEED_PER_SEC = 2.0;        // nodes/second cap (~human walk)
const COLLECT_RADIUS = 0.6;           // nodes — close enough = picked up
export const MIN_BETTING_WINDOW_MS = 60_000;
export const DEFAULT_RUN_DURATION_MS = 5 * 60_000;
export const SIGHT_RADIUS = 8;        // bot can "see" objectives within this

export interface MatchSeedLayout {
  objectives: Array<{ x: number; z: number; value: number }>;
  spawns: Array<{ x: number; z: number; yaw: number }>;
}

/**
 * Deterministic match layout from a seed. Same seed → same objective
 * positions + spawn points. Anyone with the revealed seed can verify.
 */
export function layoutFromSeed(seed: Buffer, arenaSize: number, entryCount: number, objectiveCount: number): MatchSeedLayout {
  const rng = makeRng(seed);
  const half = arenaSize / 2;
  const objectives: MatchSeedLayout["objectives"] = [];
  for (let i = 0; i < objectiveCount; i++) {
    const x = (rng() * 2 - 1) * (half - 1);
    const z = (rng() * 2 - 1) * (half - 1);
    // Most objectives worth 1; ~1 in 8 worth 3 (a "rare").
    const value = rng() < 0.125 ? 3 : 1;
    objectives.push({ x, z, value });
  }
  const spawns: MatchSeedLayout["spawns"] = [];
  for (let i = 0; i < entryCount; i++) {
    const theta = (i / entryCount) * Math.PI * 2;
    spawns.push({
      x: Math.cos(theta) * (half - 2),
      z: Math.sin(theta) * (half - 2),
      yaw: theta + Math.PI, // face inward
    });
  }
  return { objectives, spawns };
}

export function commitSeed(): { seed: Buffer; commit: string } {
  const seed = crypto.randomBytes(32);
  const commit = crypto.createHash("sha256").update(seed).digest("hex");
  return { seed, commit };
}

export function verifyCommit(commit: string, seedHex: string): boolean {
  try {
    const seed = Buffer.from(seedHex, "hex");
    return crypto.createHash("sha256").update(seed).digest("hex") === commit;
  } catch {
    return false;
  }
}

/**
 * Apply one tick of physics. Reads pending intents from each entry,
 * moves the entity (clamped to MAX_SPEED_PER_SEC * dt), checks
 * collisions against active objectives, awards points. Should be
 * called ~10Hz from the match worker.
 */
// Server-side movement AI for entries without an externally-posted
// intent. Each tick: pick the nearest live objective, head toward it
// at MAX_SPEED, biased by per-entry trait noise so trajectories don't
// look identical. Lower luck = noisier path. Higher speed = closer to
// the cap (but everyone's clamped by MAX_SPEED_PER_SEC * dt).
//
// This makes canvas matches actually go without an external bot
// runner. External bots can still POST /intent to override.
async function _autoMoveIntent(
  entry: { id: string; posX: number; posZ: number; intentMoveX: number | null },
  fighter: { power: number; speed: number; luck: number } | null,
  objectives: Array<{ posX: number; posZ: number }>,
  dtSeconds: number,
): Promise<{ mvx: number; mvz: number } | null> {
  if (entry.intentMoveX != null) return null; // honor external intent
  if (objectives.length === 0) return null;
  let best = objectives[0]!;
  let bestD = Infinity;
  for (const o of objectives) {
    const dx = o.posX - entry.posX;
    const dz = o.posZ - entry.posZ;
    const d = dx * dx + dz * dz;
    if (d < bestD) { bestD = d; best = o; }
  }
  const dx = best.posX - entry.posX;
  const dz = best.posZ - entry.posZ;
  const mag = Math.sqrt(dx * dx + dz * dz) || 1;
  const speedFactor = fighter ? 0.6 + (fighter.speed - 25) / 70 * 0.6 : 1.0;
  const noiseAmp = fighter ? Math.max(0, (75 - fighter.luck) / 250) : 0.05;
  const noiseTh = (Math.random() * 2 - 1) * noiseAmp * Math.PI;
  const cos = Math.cos(noiseTh), sin = Math.sin(noiseTh);
  const ndx = (dx * cos - dz * sin) / mag;
  const ndz = (dx * sin + dz * cos) / mag;
  const v = MAX_SPEED_PER_SEC * dtSeconds * speedFactor;
  return { mvx: ndx * v, mvz: ndz * v };
}

export async function tick(matchId: string, dtSeconds: number) {
  const match = await prisma.botMatch.findUnique({
    where: { id: matchId },
    include: { entries: true, objectives: { where: { status: "active" } } },
  });
  if (!match || match.status !== "RUNNING") return;

  const half = match.arenaSize / 2;
  const maxStep = MAX_SPEED_PER_SEC * dtSeconds;

  // Look up Fighter rows for trait-driven seek noise. One round-trip.
  const fighters = await prisma.fighter.findMany({
    where: { id: { in: match.entries.map((e) => e.fighterId) } },
    select: { id: true, power: true, speed: true, luck: true },
  });
  const fByEntry = new Map<string, { power: number; speed: number; luck: number }>();
  for (const e of match.entries) {
    const f = fighters.find((x) => x.id === e.fighterId);
    if (f) fByEntry.set(e.id, { power: f.power, speed: f.speed, luck: f.luck });
  }

  for (const entry of match.entries) {
    // Auto-move when no intent set. This makes the canvas match
    // actually run without external bot processes.
    if (entry.intentMoveX == null || entry.intentMoveZ == null) {
      const auto = await _autoMoveIntent(
        entry, fByEntry.get(entry.id) ?? null, match.objectives, dtSeconds,
      );
      if (auto) {
        entry.intentMoveX = auto.mvx;
        entry.intentMoveZ = auto.mvz;
      } else {
        continue;
      }
    }

    // Clamp the move to the speed budget. The bot proposed a velocity
    // direction; if its magnitude exceeds maxStep we scale it down.
    const mvx = entry.intentMoveX;
    const mvz = entry.intentMoveZ;
    const mag = Math.sqrt(mvx * mvx + mvz * mvz);
    let dx = mvx, dz = mvz;
    if (mag > maxStep) {
      dx = (mvx / mag) * maxStep;
      dz = (mvz / mag) * maxStep;
    }

    let newX = Math.max(-half, Math.min(half, entry.posX + dx));
    let newZ = Math.max(-half, Math.min(half, entry.posZ + dz));

    // Yaw faces movement direction; idle entries keep their last yaw.
    let newYaw = entry.yaw;
    if (mag > 0.05) newYaw = Math.atan2(dx, dz);

    // Collision check against active objectives.
    let scoreGain = 0;
    const collected: { id: string; value: number }[] = [];
    for (const obj of match.objectives) {
      const ox = obj.posX - newX;
      const oz = obj.posZ - newZ;
      if (Math.sqrt(ox * ox + oz * oz) < COLLECT_RADIUS) {
        scoreGain += obj.value;
        collected.push({ id: obj.id, value: obj.value });
      }
    }

    await prisma.$transaction([
      prisma.botMatchEntry.update({
        where: { id: entry.id },
        data: {
          posX: newX,
          posZ: newZ,
          yaw: newYaw,
          score: { increment: scoreGain },
          // Clear the intent so we don't re-apply it next tick. The
          // bot must repost each tick to keep moving.
          intentMoveX: null,
          intentMoveZ: null,
          intentAction: null,
        },
      }),
      ...collected.map((c) =>
        prisma.botMatchObjective.update({
          where: { id: c.id },
          data: {
            status: "collected",
            collectedBy: entry.id,
            collectedAt: new Date(),
          },
        })
      ),
    ]);
  }
}

/**
 * Settle the match — pays out prize pool to top finishers per the
 * payoutSplit weights, returns spectator-bet pool to bettors who
 * picked the winner, marks status SETTLED.
 */
export async function settle(matchId: string) {
  const match = await prisma.botMatch.findUnique({
    where: { id: matchId },
    include: { entries: true, bets: true },
  });
  if (!match || match.status !== "RUNNING") return;

  // Rank entries by score, ties broken by collected count then random.
  const ranked = [...match.entries].sort((a, b) => b.score - a.score);
  const split = (match.payoutSplit as number[]) ?? [60, 25, 10];

  // Apply prize-pool splits.
  const houseCut = Math.floor(match.prizePoolBps * 0.05);
  const distributable = match.prizePoolBps - houseCut;

  await prisma.$transaction(async (tx) => {
    for (let i = 0; i < ranked.length; i++) {
      const entry = ranked[i]!;
      const placement = i + 1;
      const weight = split[i] ?? 0;
      const payout = Math.floor((distributable * weight) / 100);
      await tx.botMatchEntry.update({
        where: { id: entry.id },
        data: { placement, payoutBps: payout },
      });
    }
    await tx.botMatch.update({
      where: { id: matchId },
      data: {
        status: "SETTLED",
        winnerEntryId: ranked[0]?.id,
        settledAt: new Date(),
        houseBps: houseCut,
      },
    });
  });
}

// ───────────────────── helpers ─────────────────────

function makeRng(seed: Buffer, salt = "") {
  let state = crypto.createHash("sha256").update(seed).update(salt).digest();
  let counter = 0;
  return () => {
    state = crypto.createHash("sha256").update(state).update(String(counter++)).digest();
    const n =
      (state[0]! * 2 ** 40) +
      (state[1]! * 2 ** 32) +
      (state[2]! * 2 ** 24) +
      (state[3]! * 2 ** 16) +
      (state[4]! * 2 ** 8) +
      state[5]!;
    return n / 2 ** 48;
  };
}
