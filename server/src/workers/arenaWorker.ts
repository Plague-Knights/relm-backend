import { prisma } from "../lib/prisma.js";
import { commitSeed, pickFighters, runSimulation, type FighterStat } from "../lib/arena.js";
import * as balance from "../lib/balance.js";

const TICK_MS = 5_000;
const BETTING_WINDOW_MS = 90_000; // 90s of open betting
const HOUSE_BPS = 500;            // 5% house cut on the pool
const HOUSE_BURN_BPS = 200;       // 2% of pool burns (the rest of the cut goes to "treasury")

// One round at a time — we keep things sequential so the live UI
// always has exactly one OPEN, one LOCKED-and-running, or one
// recently SETTLED round to render. The worker:
//
//   - if no OPEN round: create one (commit seed, pick fighters,
//     start a 90s betting window).
//   - if OPEN and bettingClosesAt is past: lock + reveal seed +
//     run sim + record winner.
//   - if LOCKED: settle bets (pari-mutuel split) and SETTLE the
//     round. Settlement is idempotent.
async function tick() {
  const now = new Date();
  const open = await prisma.arenaRound.findFirst({ where: { status: "OPEN" } });
  if (!open) {
    await openNewRound();
    return;
  }
  if (open.bettingClosesAt <= now) {
    await lockAndSimulate(open.id);
    return;
  }
  // Otherwise: betting still open, nothing to do.
  const locked = await prisma.arenaRound.findFirst({ where: { status: "LOCKED" } });
  if (locked) await settleRound(locked.id);
}

async function openNewRound() {
  const { seed, commit } = commitSeed();
  const fighters = pickFighters(seed);
  // Deliberately throw the *seed itself* away here — we can't store
  // it on the OPEN row or the commit-reveal property is broken. But
  // we DO need to recover it at lock time, so we tuck the seed into
  // a process-local memo keyed by commit.
  pendingSeeds.set(commit, seed);
  await prisma.arenaRound.create({
    data: {
      status: "OPEN",
      seedCommit: commit,
      fighters: fighters as unknown as object,
      bettingClosesAt: new Date(Date.now() + BETTING_WINDOW_MS),
    },
  });
}

async function lockAndSimulate(roundId: string) {
  const round = await prisma.arenaRound.findUnique({ where: { id: roundId } });
  if (!round || round.status !== "OPEN") return;
  const seed = pendingSeeds.get(round.seedCommit);
  if (!seed) {
    // If the worker restarted between OPEN and LOCK, we can't reveal
    // the seed honestly — burn the round (refund all bets) and start
    // a new one.
    await refundRound(roundId);
    return;
  }
  const fighters = round.fighters as unknown as FighterStat[];
  const winnerIdx = runSimulation(fighters, seed);
  await prisma.arenaRound.update({
    where: { id: roundId },
    data: {
      status: "LOCKED",
      seedReveal: seed.toString("hex"),
      winnerIdx,
    },
  });
  pendingSeeds.delete(round.seedCommit);
}

async function settleRound(roundId: string) {
  const round = await prisma.arenaRound.findUnique({
    where: { id: roundId },
    include: { bets: true },
  });
  if (!round || round.status !== "LOCKED" || round.winnerIdx == null) return;

  const totalPool = round.bets.reduce((s, b) => s + b.amountBps, 0);
  const winningBets = round.bets.filter((b) => b.fighterIdx === round.winnerIdx);
  const winningStake = winningBets.reduce((s, b) => s + b.amountBps, 0);

  const houseCut = Math.floor((totalPool * HOUSE_BPS) / 10_000);
  const prizePool = totalPool - houseCut;

  await prisma.$transaction(async (tx) => {
    // Pay out winners pro-rata.
    if (winningStake > 0) {
      for (const bet of winningBets) {
        const payout = Math.floor((bet.amountBps * prizePool) / winningStake);
        await tx.arenaBet.update({
          where: { id: bet.id },
          data: { payoutBps: payout, settled: true },
        });
        if (payout > 0) await balance.credit(bet.player, payout);
      }
      // Mark losing bets as settled too.
      await tx.arenaBet.updateMany({
        where: { roundId, NOT: { fighterIdx: round.winnerIdx ?? -1 } },
        data: { settled: true },
      });
    } else {
      // Nobody bet on the winner — refund everyone (acts of mercy).
      for (const bet of round.bets) {
        await tx.arenaBet.update({
          where: { id: bet.id },
          data: { payoutBps: bet.amountBps, settled: true },
        });
        await balance.credit(bet.player, bet.amountBps);
      }
    }
    await tx.arenaRound.update({
      where: { id: roundId },
      data: {
        status: "SETTLED",
        totalPoolBps: totalPool,
        houseBps: houseCut,
        settledAt: new Date(),
      },
    });
  });
}

async function refundRound(roundId: string) {
  const round = await prisma.arenaRound.findUnique({
    where: { id: roundId },
    include: { bets: true },
  });
  if (!round) return;
  await prisma.$transaction(async (tx) => {
    for (const bet of round.bets) {
      await tx.arenaBet.update({
        where: { id: bet.id },
        data: { payoutBps: bet.amountBps, settled: true },
      });
      await balance.credit(bet.player, bet.amountBps);
    }
    await tx.arenaRound.update({
      where: { id: roundId },
      data: { status: "SETTLED", settledAt: new Date() },
    });
  });
}

// In-memory map keyed by seedCommit. Lost on restart; if that happens
// the OPEN round is gracefully refunded by lockAndSimulate.
const pendingSeeds = new Map<string, Buffer>();

// Suppress unused-warning for HOUSE_BURN_BPS — the burn split is
// applied in a future contract step; for now the house cut is just
// withheld from the prize pool.
void HOUSE_BURN_BPS;

export function startArenaWorker() {
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try {
      await tick();
    } catch (e) {
      console.error("[arena] tick error", (e as Error).message);
    } finally {
      running = false;
    }
  };
  run();
  return setInterval(run, TICK_MS);
}
