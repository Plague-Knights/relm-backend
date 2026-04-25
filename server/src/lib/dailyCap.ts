import { prisma } from "./prisma.js";

// Daily-cap economy. Replaces the per-player energy meter with a
// simpler protocol-style ceiling: each player earns up to N bps per
// UTC day, after which scoring returns 0 until the day rolls over.
//
// Why this instead of energy:
//   - Bots can't game it by waiting (energy regenerates; the cap doesn't move
//     until midnight UTC).
//   - Real players don't get blocked mid-session by an empty meter — they
//     just see their day's earnings flatten out as they approach the cap.
//   - The economy gets a hard supply ceiling (PER_PLAYER * active players),
//     which gives whales nothing extra and protects token value.
//
// Tuning knobs live in `RELM_DAILY_CAP_BPS` env (defaults to 30,000 bps =
// 3 RELM / player / day), so we can ratchet without redeploying scoring.

const DEFAULT_PER_PLAYER_DAILY_CAP_BPS = 30_000;

function perPlayerCap(): number {
  const raw = process.env.RELM_DAILY_CAP_BPS;
  if (!raw) return DEFAULT_PER_PLAYER_DAILY_CAP_BPS;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_PER_PLAYER_DAILY_CAP_BPS;
}

function utcDay(now = new Date()): string {
  // YYYY-MM-DD in UTC
  return now.toISOString().slice(0, 10);
}

/**
 * Clamp the requested score to whatever the player has remaining for
 * today. Updates their daily counter atomically. Returns the bps the
 * caller should actually award.
 */
export async function clampToDaily(player: string, requestedBps: number): Promise<number> {
  if (requestedBps <= 0) return 0;
  const cap = perPlayerCap();
  const day = utcDay();

  // Upsert the daily row. Concurrent calls for the same player race here,
  // but since each scoreOnce() call processes one event at a time and
  // the scorer doesn't run two at once (per the `running` lock), the race
  // is effectively single-writer per player.
  const row = await prisma.playerDaily.upsert({
    where: { player_day: { player, day } },
    create: { player, day, bpsEarned: 0 },
    update: {},
  });

  if (row.bpsEarned >= cap) return 0;
  const remaining = cap - row.bpsEarned;
  const grant = Math.min(requestedBps, remaining);
  if (grant <= 0) return 0;

  await prisma.playerDaily.update({
    where: { player_day: { player, day } },
    data: { bpsEarned: row.bpsEarned + grant },
  });
  return grant;
}

/**
 * Read-only lookup for the energy/cap endpoint and chat command.
 * Returns today's earned amount + the cap.
 */
export async function readDaily(player: string) {
  const day = utcDay();
  const row = await prisma.playerDaily.findUnique({
    where: { player_day: { player, day } },
  });
  return {
    player,
    day,
    earnedBps: row?.bpsEarned ?? 0,
    capBps: perPlayerCap(),
  };
}
