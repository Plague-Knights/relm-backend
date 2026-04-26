// Daily land plot tax — RELM sink that scales with the size of the
// player's holdings. Each owned plot owes (tier × 10 RELM) per 24h.
// Tax goes through burnTreasurySplit so half is destroyed forever.
// If the player can't pay, the plot lapses (status = "lapsed") and
// becomes available again. Idempotent: tracks last-charge time per
// plot via the EconLedger meta column so duplicate runs are safe.

import { prisma } from "../lib/prisma.js";
import * as balance from "../lib/balance.js";
import * as econ from "../lib/econ.js";

const TAX_INTERVAL_MS = 24 * 60 * 60 * 1000;
const RELM_PER_TIER_PER_DAY = 10;

export async function chargeLandTax(now = new Date()): Promise<{ charged: number; lapsed: number }> {
  const owned = await prisma.landPlot.findMany({
    where: { status: "owned", ownerPlayer: { not: null } },
  });

  // Pull the latest land_tax ledger row per plot to compute "last charged at".
  const recent = await prisma.econLedger.findMany({
    where: { kind: "land_tax", createdAt: { gte: new Date(now.getTime() - TAX_INTERVAL_MS) } },
  });
  const recentByPlot = new Set<string>();
  for (const r of recent) {
    if (!r.meta) continue;
    try {
      const m = JSON.parse(r.meta) as { plotId?: string };
      if (m.plotId) recentByPlot.add(m.plotId);
    } catch { /* ignore */ }
  }

  let charged = 0;
  let lapsed = 0;
  for (const plot of owned) {
    if (recentByPlot.has(plot.id)) continue;     // already taxed within window
    if (!plot.ownerPlayer) continue;

    const cost = plot.tier * RELM_PER_TIER_PER_DAY * 10000;   // bps
    const newBal = await balance.debit(plot.ownerPlayer, cost);
    if (newBal === null) {
      // Can't afford — plot lapses back to the pool.
      await prisma.landPlot.update({
        where: { id: plot.id },
        data: { status: "lapsed", ownerPlayer: null, ownerSolAddr: null, claimedAt: null },
      });
      await econ.record("land_tax", 0, {
        player: plot.ownerPlayer,
        meta: { plotId: plot.id, lapsed: true },
      });
      lapsed += 1;
      continue;
    }

    await econ.burnTreasurySplit(cost, {
      player: plot.ownerPlayer,
      meta: { plotId: plot.id, tier: plot.tier, kind: "land_tax" },
    });
    charged += 1;
  }
  return { charged, lapsed };
}

export function startLandTaxWorker() {
  // Fire on boot, then every hour. The function itself is idempotent
  // because it reads recent ledger entries to skip already-charged plots.
  const tick = async () => {
    try {
      const r = await chargeLandTax();
      if (r.charged || r.lapsed) {
        console.log(`[land-tax] charged=${r.charged} lapsed=${r.lapsed}`);
      }
    } catch (e) {
      console.error("[land-tax] tick error", (e as Error).message);
    }
  };
  setTimeout(tick, 30_000);
  return setInterval(tick, 60 * 60 * 1000);
}
