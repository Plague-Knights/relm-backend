import { prisma } from "../lib/prisma.js";
import { scoreEvent } from "../lib/scoring.js";
import { spend, COST_PER_EVENT } from "../lib/energy.js";

const SCORE_INTERVAL_MS = 10_000;
const BATCH_SIZE = 500;

// Pulls unscored RewardEvent rows in chunks, applies the curve, writes
// `scoreBps` back. Idempotent — uses `scoreBps IS NULL` as the claim
// flag so two interleaved runs don't double-score.
//
// Energy gating: each event that would award positive bps consumes
// COST_PER_EVENT energy from the player. If the player is out of
// energy, the event is still consumed (scoreBps=0) so it doesn't
// re-queue forever; the player just earns nothing for it.
async function scoreOnce() {
  const rows = await prisma.rewardEvent.findMany({
    where: { scoreBps: null },
    take: BATCH_SIZE,
    orderBy: { createdAt: "asc" },
  });
  if (rows.length === 0) return 0;

  for (const row of rows) {
    let payload: unknown = null;
    try { payload = JSON.parse(row.payload); } catch {}
    const baseBps = scoreEvent(row.kind, payload);

    let effectiveBps = baseBps;
    if (baseBps > 0) {
      const after = await spend(row.player, COST_PER_EVENT);
      if (after === null) effectiveBps = 0; // out of energy — record but don't award
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
