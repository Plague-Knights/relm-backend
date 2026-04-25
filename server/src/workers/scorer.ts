import { prisma } from "../lib/prisma.js";
import { scoreEvent } from "../lib/scoring.js";
import { clampToDaily } from "../lib/dailyCap.js";

const SCORE_INTERVAL_MS = 10_000;
const BATCH_SIZE = 500;

// Pulls unscored RewardEvent rows in chunks, applies the curve, writes
// `scoreBps` back. Idempotent — uses `scoreBps IS NULL` as the claim
// flag so two interleaved runs don't double-score.
//
// Daily cap: each event that would award positive bps gets clamped to
// whatever the player has left for today (UTC midnight reset). Past
// the cap, the event is still consumed (scoreBps=0) so it doesn't
// re-queue forever. Replaces the older energy-meter gating.
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

    const effectiveBps = baseBps > 0
      ? await clampToDaily(row.player, baseBps)
      : 0;

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
