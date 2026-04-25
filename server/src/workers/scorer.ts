import { prisma } from "../lib/prisma.js";
import { scoreEvent } from "../lib/scoring.js";
import { clampToDaily } from "../lib/dailyCap.js";
import { walletEligibleForReward, patternMultiplier } from "../lib/antiBot.js";

const SCORE_INTERVAL_MS = 10_000;
const BATCH_SIZE = 500;

// Pulls unscored RewardEvent rows in chunks, applies the curve, writes
// `scoreBps` back. Idempotent — uses `scoreBps IS NULL` as the claim
// flag so two interleaved runs don't double-score.
//
// Reward gates, in order:
//   1. Anti-bot wallet-age — wallets linked less than N days ago get
//      scoreBps=0 across the board.
//   2. Anti-bot cadence/variance — dig timings collapse the multiplier
//      toward 0 if they look mechanical (lib/antiBot.ts).
//   3. Daily cap — clamp to what's left of the player's UTC-day budget,
//      with halving applied on schedule (lib/dailyCap.ts).
//
// Zeroed events still write scoreBps=0 so the queue drains and the
// pattern is preserved on RewardEvent for later forensic correlation.
async function scoreOnce() {
  const rows = await prisma.rewardEvent.findMany({
    where: { scoreBps: null },
    take: BATCH_SIZE,
    orderBy: { createdAt: "asc" },
  });
  if (rows.length === 0) return 0;

  // Cache the per-player checks within this batch — same farmer's
  // burst of events shouldn't re-query 500 times.
  const eligibleCache = new Map<string, boolean>();
  const patternCache = new Map<string, number>();

  for (const row of rows) {
    let payload: unknown = null;
    try { payload = JSON.parse(row.payload); } catch {}
    const baseBps = scoreEvent(row.kind, payload);

    let effectiveBps = 0;
    if (baseBps > 0) {
      let eligible = eligibleCache.get(row.player);
      if (eligible === undefined) {
        eligible = await walletEligibleForReward(row.player);
        eligibleCache.set(row.player, eligible);
      }
      if (eligible) {
        let multiplier = patternCache.get(row.player);
        if (multiplier === undefined) {
          multiplier = await patternMultiplier(row.player);
          patternCache.set(row.player, multiplier);
        }
        const adjusted = Math.floor(baseBps * multiplier);
        effectiveBps = adjusted > 0
          ? await clampToDaily(row.player, adjusted)
          : 0;
      }
    }

    await prisma.rewardEvent.update({
      where: { id: row.id },
      data: { scoreBps: effectiveBps },
    });
  }
  return rows.length;
}

export function startScorer() {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const n = await scoreOnce();
      if (n > 0) console.log(`[scorer] scored ${n} events`);
    } catch (e) {
      console.error("[scorer] error", e);
    } finally {
      running = false;
    }
  };
  tick();
  return setInterval(tick, SCORE_INTERVAL_MS);
}
