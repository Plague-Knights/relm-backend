import { Router, type Request, type Response } from "express";
import { prisma } from "../lib/prisma.js";
import * as balance from "../lib/balance.js";
import { verifyCommit, runSimulation, type FighterStat } from "../lib/arena.js";

export const arenaRouter = Router();

const PLAYER_RE = /^[A-Za-z0-9_-]{1,64}$/;
const MAX_BET_BPS = 100_000;  // 10 RELM per bet — keeps any single
                              //    whale or sybil from owning a round.

// GET /api/arena/current → the OPEN round + fighters + recent SETTLED.
arenaRouter.get("/current", async (req: Request, res: Response) => {
  const player = String(req.query.player ?? "");
  const open = await prisma.arenaRound.findFirst({
    where: { status: "OPEN" },
    orderBy: { createdAt: "desc" },
    include: { bets: player ? { where: { player } } : false },
  });
  const lastSettled = await prisma.arenaRound.findFirst({
    where: { status: "SETTLED" },
    orderBy: { settledAt: "desc" },
  });
  let bal: number | null = null;
  if (player && PLAYER_RE.test(player)) bal = await balance.get(player);

  res.json({
    open: open ? serializeRound(open) : null,
    lastSettled: lastSettled ? serializeRound(lastSettled) : null,
    balanceBps: bal,
  });
});

// POST /api/arena/bet { roundId, player, fighterIdx, amountBps }
arenaRouter.post("/bet", async (req: Request, res: Response) => {
  const { roundId, player, fighterIdx, amountBps } = (req.body ?? {}) as Record<string, unknown>;
  if (typeof roundId !== "string" || !roundId) return res.status(400).json({ error: "roundId required" });
  if (typeof player !== "string" || !PLAYER_RE.test(player)) return res.status(400).json({ error: "bad player" });
  const idx = Number(fighterIdx);
  const amt = Number(amountBps);
  if (!Number.isInteger(idx) || idx < 0 || idx > 3) return res.status(400).json({ error: "fighterIdx must be 0..3" });
  if (!Number.isInteger(amt) || amt <= 0) return res.status(400).json({ error: "amountBps must be > 0" });
  if (amt > MAX_BET_BPS) return res.status(400).json({ error: `amountBps must be <= ${MAX_BET_BPS}` });

  const round = await prisma.arenaRound.findUnique({ where: { id: roundId } });
  if (!round || round.status !== "OPEN") return res.status(409).json({ error: "round not open" });
  if (round.bettingClosesAt <= new Date()) return res.status(409).json({ error: "betting window closed" });

  // Debit balance up front; if it succeeds we own the funds and can
  // safely write the bet row. Failure here = insufficient balance.
  const remaining = await balance.debit(player, amt);
  if (remaining === null) return res.status(402).json({ error: "insufficient balance" });

  try {
    const bet = await prisma.arenaBet.upsert({
      where: { roundId_player_fighterIdx: { roundId, player, fighterIdx: idx } },
      create: { roundId, player, fighterIdx: idx, amountBps: amt },
      update: { amountBps: { increment: amt } },
    });
    res.json({ ok: true, bet, balanceBps: remaining });
  } catch (e) {
    // Restore the balance if the DB write failed.
    await balance.credit(player, amt);
    res.status(500).json({ error: (e as Error).message });
  }
});

// GET /api/arena/round/:id
arenaRouter.get("/round/:id", async (req: Request, res: Response) => {
  const round = await prisma.arenaRound.findUnique({
    where: { id: String(req.params.id) },
    include: { bets: true },
  });
  if (!round) return res.status(404).json({ error: "not found" });
  res.json(serializeRound(round, true));
});

// GET /api/arena/history?limit=20 — recent settled rounds for the
// "results" tab on the UI.
arenaRouter.get("/history", async (req: Request, res: Response) => {
  const limit = Math.min(50, Math.max(1, Number(req.query.limit ?? 20)));
  const rows = await prisma.arenaRound.findMany({
    where: { status: "SETTLED" },
    orderBy: { settledAt: "desc" },
    take: limit,
  });
  res.json({ rounds: rows.map((r) => serializeRound(r)) });
});

// GET /api/arena/verify/:id — server re-runs the sim from the
// revealed seed and returns both the recorded winner and the
// re-derived winner so anyone can sanity-check a round.
arenaRouter.get("/verify/:id", async (req: Request, res: Response) => {
  const round = await prisma.arenaRound.findUnique({ where: { id: String(req.params.id) } });
  if (!round) return res.status(404).json({ error: "not found" });
  if (!round.seedReveal) return res.status(409).json({ error: "round not yet locked" });
  const commitOk = verifyCommit(round.seedCommit, round.seedReveal);
  const fighters = round.fighters as unknown as FighterStat[];
  const seed = Buffer.from(round.seedReveal, "hex");
  const recomputed = runSimulation(fighters, seed);
  res.json({
    id: round.id,
    commit: round.seedCommit,
    seedReveal: round.seedReveal,
    commitMatchesSeed: commitOk,
    recordedWinnerIdx: round.winnerIdx,
    recomputedWinnerIdx: recomputed,
    fightersMatchesRecord: round.winnerIdx === recomputed,
  });
});

// GET /api/arena/balance/:player
arenaRouter.get("/balance/:player", async (req: Request, res: Response) => {
  const player = String(req.params.player);
  if (!PLAYER_RE.test(player)) return res.status(400).json({ error: "bad player" });
  const bal = await balance.get(player);
  res.json({ player, balanceBps: bal });
});

function serializeRound(r: any, includeBets = false) {
  const out: Record<string, unknown> = {
    id: r.id,
    status: r.status,
    seedCommit: r.seedCommit,
    seedReveal: r.seedReveal ?? null,
    fighters: r.fighters,
    winnerIdx: r.winnerIdx ?? null,
    totalPoolBps: r.totalPoolBps,
    houseBps: r.houseBps,
    bettingClosesAt: r.bettingClosesAt,
    settledAt: r.settledAt ?? null,
    createdAt: r.createdAt,
  };
  if (includeBets || Array.isArray(r.bets)) {
    out.bets = r.bets ?? [];
  }
  return out;
}
