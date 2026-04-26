import { prisma } from "../lib/prisma.js";
import { tick, settle } from "../lib/botMatch.js";
import * as balance from "../lib/balance.js";
import * as econ from "../lib/econ.js";

// Bot battle match worker. Drives all active matches:
//   - OPEN matches whose bettingClosesAt has passed → flip to RUNNING,
//     reveal the seed (kept in memory by the route handler that
//     created it; for now we just store reveal=null until we add a
//     persistent commit-reveal store).
//   - RUNNING matches → tick every TICK_MS.
//   - RUNNING matches whose endsAt has passed → settle and pay out
//     prize pool + spectator-bet pool.
//
// Tick rate is 100ms (10Hz). Bots polling at 5–10Hz comfortably keeps
// up. Movement quantum at MAX_SPEED=2.0 m/s × 0.1s = 0.2m per tick.

const TICK_MS = 100;

// In-memory seed cache so /verify can show the reveal after the
// match runs. Production: persist this server-side and hand it back
// at lock time (similar to ArenaWorker).
const PENDING_SEEDS = new Map<string, string>();

export function rememberSeed(matchId: string, seedHex: string) {
  PENDING_SEEDS.set(matchId, seedHex);
}

async function lockOpenMatches(now: Date) {
  const ready = await prisma.botMatch.findMany({
    where: { status: "OPEN", bettingClosesAt: { lte: now } },
  });
  for (const m of ready) {
    const reveal = PENDING_SEEDS.get(m.id) ?? null;
    await prisma.botMatch.update({
      where: { id: m.id },
      data: { status: "RUNNING", seedReveal: reveal },
    });
    PENDING_SEEDS.delete(m.id);
  }
}

async function settleFinishedMatches(now: Date) {
  const due = await prisma.botMatch.findMany({
    where: { status: "RUNNING", endsAt: { lte: now } },
    include: { entries: true, bets: true },
  });
  for (const m of due) {
    await settle(m.id);

    // Credit owners + spectator bettors. Done after settle so we have
    // the placements + payoutBps fields populated.
    const fresh = await prisma.botMatch.findUnique({
      where: { id: m.id },
      include: { entries: true, bets: true },
    });
    if (!fresh) continue;

    // House cut on the prize pool is a sink: 50% burned, 50% to
    // treasury. (settle() already subtracted houseBps from the
    // distributable pool — we just record where it went.)
    if (fresh.houseBps > 0) {
      await econ.burnTreasurySplit(fresh.houseBps, {
        meta: { matchId: fresh.id, kind: "tournament_fee", source: "prize_pool_house_cut" },
      });
    }

    // Owner cuts.
    const fighters = await prisma.fighter.findMany({
      where: { id: { in: fresh.entries.map((e) => e.fighterId) } },
    });
    const fByEntry = new Map(fresh.entries.map((e) => [e.id, fighters.find((f) => f.id === e.fighterId)]));
    for (const e of fresh.entries) {
      if (e.payoutBps > 0) {
        const f = fByEntry.get(e.id);
        if (f?.ownerPlayer) await balance.credit(f.ownerPlayer, e.payoutBps);
      }
    }

    // Spectator bets — winner-takes-all on the entry that placed 1st.
    const winningEntryId = fresh.winnerEntryId;
    if (winningEntryId) {
      const winningStake = fresh.bets
        .filter((b) => b.entryId === winningEntryId)
        .reduce((s, b) => s + b.amountBps, 0);
      const houseCutBets = Math.floor(fresh.totalPoolBps * 0.05);
      const distributable = fresh.totalPoolBps - houseCutBets;
      // Spectator-bet house cut also splits 50/50 burn/treasury.
      if (houseCutBets > 0) {
        await econ.burnTreasurySplit(houseCutBets, {
          meta: { matchId: fresh.id, kind: "tournament_fee", source: "spectator_bet_house_cut" },
        });
      }

      if (winningStake > 0) {
        for (const bet of fresh.bets) {
          if (bet.entryId !== winningEntryId) continue;
          const payout = Math.floor((bet.amountBps * distributable) / winningStake);
          await prisma.botMatchBet.update({
            where: { id: bet.id },
            data: { payoutBps: payout, settled: true },
          });
          if (payout > 0) await balance.credit(bet.player, payout);
        }
        await prisma.botMatchBet.updateMany({
          where: { matchId: m.id, NOT: { entryId: winningEntryId } },
          data: { settled: true },
        });
      } else {
        // No one bet on the winner — refund all spectator bets.
        for (const bet of fresh.bets) {
          await prisma.botMatchBet.update({
            where: { id: bet.id },
            data: { payoutBps: bet.amountBps, settled: true },
          });
          await balance.credit(bet.player, bet.amountBps);
        }
      }
    }
  }
}

async function tickRunningMatches() {
  const running = await prisma.botMatch.findMany({
    where: { status: "RUNNING" },
    select: { id: true },
  });
  await Promise.all(running.map((m) => tick(m.id, TICK_MS / 1000)));
}

export function startBotMatchWorker() {
  let busy = false;
  const loop = async () => {
    if (busy) return;
    busy = true;
    try {
      const now = new Date();
      await lockOpenMatches(now);
      await tickRunningMatches();
      await settleFinishedMatches(now);
    } catch (e) {
      console.error("[bot-match] tick error", (e as Error).message);
    } finally {
      busy = false;
    }
  };
  loop();
  return setInterval(loop, TICK_MS);
}
