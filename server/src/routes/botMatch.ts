import { Router, type Request, type Response, type NextFunction } from "express";
import * as crypto from "node:crypto";
import { prisma } from "../lib/prisma.js";
import * as balance from "../lib/balance.js";
import {
  commitSeed, verifyCommit, layoutFromSeed,
  MIN_BETTING_WINDOW_MS, DEFAULT_RUN_DURATION_MS,
} from "../lib/botMatch.js";
import { rememberSeed } from "../workers/botMatchWorker.js";
import { tickBrains, type BotObservation } from "../lib/botBrain.js";

export const botMatchRouter = Router();

const PLAYER_RE = /^[A-Za-z0-9_-]{1,64}$/;

function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const expected = process.env.RELM_ADMIN_KEY;
  if (!expected) return res.status(503).json({ error: "admin disabled" });
  if (req.header("x-admin-key") !== expected) return res.status(401).json({ error: "unauthorized" });
  next();
}

// GET /api/bot-match/active — currently running or open-for-betting matches.
botMatchRouter.get("/active", async (_req: Request, res: Response) => {
  const open = await prisma.botMatch.findMany({
    where: { status: { in: ["OPEN", "RUNNING"] } },
    include: { entries: true, objectives: { where: { status: "active" } } },
    orderBy: { startsAt: "asc" },
    take: 10,
  });
  res.json({ matches: open.map((m) => serializeMatch(m)) });
});

// GET /api/bot-match/:id/stream — Server-Sent Events. Pushes the full
// match state every 100ms while the match is active. Clients (the
// /match/[id] canvas page) tail this and render frames live.
//
// Why SSE not WebSocket: SSE is one-way (server → client) which is
// exactly what we need; auto-reconnects in browsers; works through
// every CDN; no protocol negotiation. WebSocket is overkill for a
// pure broadcast channel.
botMatchRouter.get("/:id/stream", async (req: Request, res: Response) => {
  const matchId = String(req.params.id);
  res.set({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders();

  let alive = true;
  req.on("close", () => { alive = false; });

  const tick = async () => {
    if (!alive) return;
    try {
      const m = await prisma.botMatch.findUnique({
        where: { id: matchId },
        include: { entries: true, objectives: { where: { status: "active" } } },
      });
      if (!m) {
        res.write(`event: error\ndata: ${JSON.stringify({ error: "not found" })}\n\n`);
        res.end();
        return;
      }
      const payload = {
        id: m.id,
        status: m.status,
        arenaSize: m.arenaSize,
        prizePoolBps: m.prizePoolBps,
        timeLeftMs: Math.max(0, m.endsAt.getTime() - Date.now()),
        entries: m.entries.map((e) => ({
          id: e.id,
          fighterId: e.fighterId,
          x: e.posX, z: e.posZ, yaw: e.yaw,
          hp: e.hp, score: e.score,
          placement: e.placement,
        })),
        objectives: m.objectives.map((o) => ({
          id: o.id, x: o.posX, z: o.posZ, value: o.value,
        })),
      };
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
      // Stop streaming once the match is settled — clients see the
      // final frame and disconnect.
      if (m.status === "SETTLED" || m.status === "CANCELLED") {
        res.end();
        return;
      }
    } catch (e) {
      res.write(`event: error\ndata: ${JSON.stringify({ error: (e as Error).message })}\n\n`);
    }
    setTimeout(tick, 100);
  };
  tick();
});

// GET /api/bot-match/:id — full public state.
botMatchRouter.get("/:id", async (req: Request, res: Response) => {
  const m = await prisma.botMatch.findUnique({
    where: { id: String(req.params.id) },
    include: { entries: true, objectives: true, bets: true },
  });
  if (!m) return res.status(404).json({ error: "not found" });
  res.json(serializeMatch(m, true));
});

// GET /api/bot-match/:id/state?entry=<id> — observation for a specific
// bot. Returns its own pose, every other entry's pose (so it can plan
// around competitors), and active objectives.
botMatchRouter.get("/:id/state", async (req: Request, res: Response) => {
  const matchId = String(req.params.id);
  const entryId = String(req.query.entry ?? "");
  const m = await prisma.botMatch.findUnique({
    where: { id: matchId },
    include: { entries: true, objectives: { where: { status: "active" } } },
  });
  if (!m) return res.status(404).json({ error: "not found" });
  const me = m.entries.find((e) => e.id === entryId);
  if (!me) return res.status(404).json({ error: "entry not in match" });

  res.json({
    matchId: m.id,
    status: m.status,
    arenaSize: m.arenaSize,
    timeLeftMs: Math.max(0, m.endsAt.getTime() - Date.now()),
    self: {
      id: me.id,
      x: me.posX, z: me.posZ, yaw: me.yaw,
      hp: me.hp, score: me.score,
    },
    others: m.entries
      .filter((e) => e.id !== entryId)
      .map((e) => ({ id: e.id, x: e.posX, z: e.posZ, yaw: e.yaw, score: e.score })),
    objectives: m.objectives.map((o) => ({ id: o.id, x: o.posX, z: o.posZ, value: o.value })),
  });
});

// POST /api/bot-match/:id/intent
// Headers: Authorization: Bearer <intentToken>
// Body: { entryId, moveX?, moveZ?, action? }
//
// The bot tells the server what it wants to do this tick. Server
// applies on the next tick, clamped to legal speed. No "x,y position"
// in the body — server is the only one who sets positions.
botMatchRouter.post("/:id/intent", async (req: Request, res: Response) => {
  const matchId = String(req.params.id);
  const auth = (req.header("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { entryId, moveX, moveZ, action } = (req.body ?? {}) as Record<string, unknown>;

  if (typeof entryId !== "string" || !entryId) return res.status(400).json({ error: "entryId required" });
  if (typeof moveX !== "number" || typeof moveZ !== "number") {
    return res.status(400).json({ error: "moveX + moveZ required (numbers)" });
  }
  if (Math.abs(moveX) > 4 || Math.abs(moveZ) > 4) {
    return res.status(400).json({ error: "intent magnitude exceeds limit" });
  }

  const entry = await prisma.botMatchEntry.findUnique({ where: { id: entryId } });
  if (!entry || entry.matchId !== matchId) return res.status(404).json({ error: "entry not in match" });
  if (entry.intentToken !== auth) return res.status(401).json({ error: "bad token" });

  const match = await prisma.botMatch.findUnique({ where: { id: matchId } });
  if (!match || match.status !== "RUNNING") return res.status(409).json({ error: "match not running" });

  await prisma.botMatchEntry.update({
    where: { id: entryId },
    data: {
      intentMoveX: moveX,
      intentMoveZ: moveZ,
      intentAction: typeof action === "string" ? action : null,
      intentAt: new Date(),
    },
  });
  res.json({ ok: true, ack: { moveX, moveZ, action: action ?? null } });
});

// POST /api/bot-match — admin creates a match. Picks a seed, commits
// it, slots in the supplied fighter entries (each pays the entry fee
// from their PlayerBalance up front).
botMatchRouter.post("/", requireAdmin, async (req: Request, res: Response) => {
  const { fighterIds, entryFeeBps, runDurationMs, bettingWindowMs, arenaSize, objectiveCount } =
    (req.body ?? {}) as Record<string, unknown>;

  if (!Array.isArray(fighterIds) || fighterIds.length < 2 || fighterIds.length > 8) {
    return res.status(400).json({ error: "fighterIds 2..8 required" });
  }
  for (const id of fighterIds) {
    if (typeof id !== "string") return res.status(400).json({ error: "fighterId must be string" });
  }
  const fee = Number.isInteger(entryFeeBps) ? (entryFeeBps as number) : 10_000;
  const runMs = Number.isInteger(runDurationMs) ? (runDurationMs as number) : DEFAULT_RUN_DURATION_MS;
  const betMs = Number.isInteger(bettingWindowMs) ? (bettingWindowMs as number) : MIN_BETTING_WINDOW_MS;
  const aSize = Number.isInteger(arenaSize) ? (arenaSize as number) : 16;
  const objCount = Number.isInteger(objectiveCount) ? (objectiveCount as number) : 12;

  // Resolve fighters → owner addresses → check + debit balances.
  const fighters = await prisma.fighter.findMany({ where: { id: { in: fighterIds as string[] } } });
  if (fighters.length !== fighterIds.length) return res.status(404).json({ error: "fighter not found" });

  // Each fighter must have an ownerPlayer (the in-game name) so we
  // know whose balance to debit. Pass-2 Solana NFTs will resolve via
  // ownerSol → PlayerWallet but that's not wired yet.
  for (const f of fighters) {
    if (!f.ownerPlayer) return res.status(400).json({ error: `fighter ${f.id} has no ownerPlayer` });
  }

  for (const f of fighters) {
    const remaining = await balance.debit(f.ownerPlayer!, fee);
    if (remaining === null) {
      return res.status(402).json({ error: `${f.ownerPlayer} cannot cover entry fee` });
    }
  }

  // Build the match + entries + objectives all in one go.
  const { seed, commit } = commitSeed();
  const layout = layoutFromSeed(Buffer.from(seed), aSize, fighterIds.length, objCount);
  const now = Date.now();

  const match = await prisma.botMatch.create({
    data: {
      status: "OPEN",
      arenaSize: aSize,
      seedCommit: commit,
      startsAt: new Date(now + betMs),
      endsAt: new Date(now + betMs + runMs),
      bettingClosesAt: new Date(now + betMs),
      entryFeeBps: fee,
      prizePoolBps: fee * fighterIds.length,
      payoutSplit: [60, 25, 10],
      entries: {
        create: fighters.map((f, i) => ({
          fighterId: f.id,
          posX: layout.spawns[i]!.x,
          posZ: layout.spawns[i]!.z,
          yaw: layout.spawns[i]!.yaw,
          intentToken: crypto.randomBytes(24).toString("hex"),
          entryFeeBps: fee,
        })),
      },
      objectives: {
        create: layout.objectives.map((o) => ({ posX: o.x, posZ: o.z, value: o.value })),
      },
    },
    include: { entries: true, objectives: true },
  });

  // Hand the seed to the worker so it can attach it as `seedReveal`
  // when the match locks. Plus echo the per-entry intent tokens to
  // admin so they can be distributed to each bot operator.
  rememberSeed(match.id, seed.toString("hex"));
  res.json({
    match: serializeMatch(match, true),
    seed: seed.toString("hex"),
    intentTokens: match.entries.map((e) => ({ entryId: e.id, fighterId: e.fighterId, intentToken: e.intentToken })),
  });
});

// POST /api/bot-match/:id/bet — pari-mutuel spectator bet (separate
// from the entry-fee gambling layer).
botMatchRouter.post("/:id/bet", async (req: Request, res: Response) => {
  const matchId = String(req.params.id);
  const { player, entryId, amountBps } = (req.body ?? {}) as Record<string, unknown>;
  if (typeof player !== "string" || !PLAYER_RE.test(player)) return res.status(400).json({ error: "bad player" });
  if (typeof entryId !== "string") return res.status(400).json({ error: "entryId required" });
  const amt = Number(amountBps);
  if (!Number.isInteger(amt) || amt <= 0) return res.status(400).json({ error: "amountBps > 0 required" });

  const match = await prisma.botMatch.findUnique({ where: { id: matchId } });
  if (!match || match.status !== "OPEN") return res.status(409).json({ error: "betting not open" });
  if (match.bettingClosesAt <= new Date()) return res.status(409).json({ error: "betting window closed" });

  const remaining = await balance.debit(player, amt);
  if (remaining === null) return res.status(402).json({ error: "insufficient balance" });

  try {
    const bet = await prisma.botMatchBet.upsert({
      where: { matchId_player_entryId: { matchId, player, entryId } },
      create: { matchId, player, entryId, amountBps: amt },
      update: { amountBps: { increment: amt } },
    });
    await prisma.botMatch.update({
      where: { id: matchId },
      data: { totalPoolBps: { increment: amt } },
    });
    res.json({ ok: true, bet, balanceBps: remaining });
  } catch (e) {
    await balance.credit(player, amt);
    res.status(500).json({ error: (e as Error).message });
  }
});

// POST /api/bot-match/in-engine/tick — Luanti mod posts every ~3s with
// a snapshot of all active bots. We run each through the LLM brain
// (Ollama) and return per-bot commands (chat, pace, etc). Idle ticks
// return {} commands so the mod's scripted dig keeps running.
botMatchRouter.post("/in-engine/tick", async (req: Request, res: Response) => {
  const body = (req.body ?? {}) as { bots?: unknown };
  if (!Array.isArray(body.bots)) {
    return res.status(400).json({ error: "bots[] required" });
  }
  const observations: BotObservation[] = [];
  for (const raw of body.bots) {
    if (!raw || typeof raw !== "object") continue;
    const o = raw as Record<string, unknown>;
    const name = String(o.name ?? "").slice(0, 64);
    if (!name || !PLAYER_RE.test(name.replace(/[^A-Za-z0-9_-]/g, ""))) continue;
    const pace = String(o.pace ?? "normal");
    observations.push({
      name,
      power: Number(o.power) || 50,
      speed: Number(o.speed) || 50,
      luck: Number(o.luck) || 50,
      score: Number(o.score) || 0,
      posY: Number(o.posY) || 0,
      rank: Number(o.rank) || 1,
      topScore: Number(o.topScore) || 0,
      nearbyBots: Array.isArray(o.nearbyBots)
        ? o.nearbyBots.map((x) => String(x).slice(0, 64)).slice(0, 8)
        : [],
      stamina: typeof o.stamina === "number" ? Math.max(0, Math.min(100, o.stamina)) : 100,
      idleSec: typeof o.idleSec === "number" ? Math.max(0, o.idleSec) : 0,
      pace: ["fast", "normal", "slow", "rest"].includes(pace) ? (pace as "fast" | "normal" | "slow" | "rest") : "normal",
      lastChat: typeof o.lastChat === "string" ? o.lastChat.slice(0, 200) : undefined,
    });
  }
  try {
    const commands = await tickBrains(observations);
    res.json({ ok: true, commands });
  } catch (e) {
    res.json({ ok: false, error: (e as Error).message, commands: {} });
  }
});

// POST /api/bot-match/in-engine/seed — Luanti mod calls at match start
// to get a committed seed for diamond placement. Returns { commit,
// seed } where commit = sha256(seed). The mod uses `seed` to
// deterministically place the diamond (no math.random). The commit
// is logged + can be verified by spectators against the revealed
// seed at match settle.
botMatchRouter.post("/in-engine/seed", async (_req: Request, res: Response) => {
  const { seed, commit } = commitSeed();
  // Persist the seed against the most recent OPEN/RUNNING match if
  // one exists. Fall back to ephemeral commit otherwise so the mod
  // can still run match-only fairness without a backend match row.
  const m = await prisma.botMatch.findFirst({
    where: { status: { in: ["OPEN", "RUNNING"] } },
    orderBy: { startsAt: "desc" },
  });
  if (m) {
    await prisma.botMatch.update({
      where: { id: m.id },
      data: { seedCommit: commit, seedReveal: null },
    });
  }
  res.json({ commit, seed: seed.toString("hex"), matchId: m?.id ?? null });
});

// POST /api/bot-match/in-engine/finish — fired by the Luanti mod when
// a bot wins an in-engine match. Uses the OPEN/RUNNING match's
// entries to find the winner by name, settles the match (prize pool
// split + spectator-bet payouts), credits owners.
//
// Best-effort: if no live match is running we just log the result so
// the mod can keep working without a backend match registered.
botMatchRouter.post("/in-engine/finish", async (req: Request, res: Response) => {
  const { winnerName } = (req.body ?? {}) as Record<string, unknown>;
  if (typeof winnerName !== "string" || !winnerName) {
    return res.status(400).json({ error: "winnerName required" });
  }
  // Find the most recent OPEN or RUNNING match that has an entry for
  // a fighter with this name. In-engine names map 1:1 to Fighter.name
  // for now (Pass-2 will use Fighter.id).
  const match = await prisma.botMatch.findFirst({
    where: { status: { in: ["OPEN", "RUNNING"] } },
    orderBy: { startsAt: "desc" },
  });
  if (!match) {
    return res.json({ ok: true, settled: false, reason: "no live match" });
  }
  const entries = await prisma.botMatchEntry.findMany({
    where: { matchId: match.id },
  });
  const winnerFighter = await prisma.fighter.findFirst({ where: { name: winnerName } });
  if (!winnerFighter) {
    return res.json({ ok: true, settled: false, reason: "winner fighter not in DB" });
  }
  const winnerEntry = entries.find((e) => e.fighterId === winnerFighter.id);
  if (!winnerEntry) {
    return res.json({ ok: true, settled: false, reason: "winner not in this match's entries" });
  }

  // Mark winner top-finisher, settle prize pool to top-1 only for
  // first-to-diamond format (winner-take-all on the entry-fee pool).
  await prisma.$transaction(async (tx) => {
    await tx.botMatchEntry.update({
      where: { id: winnerEntry.id },
      data: { placement: 1, payoutBps: match.prizePoolBps - Math.floor(match.prizePoolBps * 0.05) },
    });
    await tx.botMatch.update({
      where: { id: match.id },
      data: {
        status: "SETTLED",
        winnerEntryId: winnerEntry.id,
        settledAt: new Date(),
        houseBps: Math.floor(match.prizePoolBps * 0.05),
      },
    });
  });

  // Credit owner of winning fighter.
  if (winnerFighter.ownerPlayer) {
    const owner_payout = match.prizePoolBps - Math.floor(match.prizePoolBps * 0.05);
    if (owner_payout > 0) await balance.credit(winnerFighter.ownerPlayer, owner_payout);
  }

  // Settle spectator bets on the winner.
  const bets = await prisma.botMatchBet.findMany({ where: { matchId: match.id } });
  const winningStake = bets
    .filter((b) => b.entryId === winnerEntry.id)
    .reduce((s, b) => s + b.amountBps, 0);
  const houseCutBets = Math.floor(match.totalPoolBps * 0.05);
  const distributable = match.totalPoolBps - houseCutBets;
  if (winningStake > 0) {
    for (const bet of bets) {
      if (bet.entryId !== winnerEntry.id) continue;
      const payout = Math.floor((bet.amountBps * distributable) / winningStake);
      await prisma.botMatchBet.update({
        where: { id: bet.id },
        data: { payoutBps: payout, settled: true },
      });
      if (payout > 0) await balance.credit(bet.player, payout);
    }
    await prisma.botMatchBet.updateMany({
      where: { matchId: match.id, NOT: { entryId: winnerEntry.id } },
      data: { settled: true },
    });
  }

  res.json({
    ok: true,
    settled: true,
    matchId: match.id,
    winnerEntryId: winnerEntry.id,
    ownerCredit: winnerFighter.ownerPlayer ?? null,
    spectatorBetsSettled: bets.length,
  });
});

// GET /api/bot-match/verify/:id — same trust audit the Arena offers.
botMatchRouter.get("/verify/:id", async (req: Request, res: Response) => {
  const m = await prisma.botMatch.findUnique({ where: { id: String(req.params.id) } });
  if (!m) return res.status(404).json({ error: "not found" });
  if (!m.seedReveal) return res.status(409).json({ error: "match not yet locked" });
  const ok = verifyCommit(m.seedCommit, m.seedReveal);
  res.json({
    id: m.id,
    commit: m.seedCommit,
    seedReveal: m.seedReveal,
    commitMatchesSeed: ok,
  });
});

function serializeMatch(m: any, includeBets = false) {
  const out: Record<string, unknown> = {
    id: m.id,
    status: m.status,
    arenaSize: m.arenaSize,
    seedCommit: m.seedCommit,
    seedReveal: m.seedReveal,
    startsAt: m.startsAt,
    endsAt: m.endsAt,
    bettingClosesAt: m.bettingClosesAt,
    settledAt: m.settledAt,
    entryFeeBps: m.entryFeeBps,
    prizePoolBps: m.prizePoolBps,
    payoutSplit: m.payoutSplit,
    totalPoolBps: m.totalPoolBps,
    houseBps: m.houseBps,
    winnerEntryId: m.winnerEntryId,
    entries: (m.entries ?? []).map((e: any) => ({
      id: e.id,
      fighterId: e.fighterId,
      posX: e.posX, posZ: e.posZ, yaw: e.yaw,
      hp: e.hp, score: e.score,
      placement: e.placement, payoutBps: e.payoutBps,
      // intentToken is private; never serialize.
    })),
    objectives: (m.objectives ?? []).map((o: any) => ({
      id: o.id, x: o.posX, z: o.posZ, value: o.value, status: o.status,
    })),
  };
  if (includeBets) {
    out.bets = (m.bets ?? []).map((b: any) => ({
      player: b.player, entryId: b.entryId, amountBps: b.amountBps,
    }));
  }
  return out;
}
