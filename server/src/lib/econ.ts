// Token economy ledger helpers. Every RELM mint/burn/treasury move
// writes a row to the EconLedger so circulating supply, daily burn,
// and mint/burn ratio are computable from the DB. Burns are permanent;
// treasury entries fund prize pools / tournament payouts.

import { prisma } from "./prisma.js";

type LedgerKind =
  | "mint"          // emission via mining (already credited to player)
  | "burn"          // permanent removal from supply
  | "treasury"      // locked in house pool (still extant, just not circulating)
  | "shop_buy"      // metadata row when a player buys a shop item
  | "land_tax"
  | "tournament_fee"
  | "refund";

export async function record(
  kind: LedgerKind,
  amountBps: number,
  opts: { player?: string; address?: string; meta?: Record<string, unknown> } = {},
) {
  if (amountBps <= 0) return;
  await prisma.econLedger.create({
    data: {
      kind,
      amountBps,
      player: opts.player ?? null,
      address: opts.address ?? null,
      meta: opts.meta ? JSON.stringify(opts.meta) : null,
    },
  });
}

// Standard 50/50 burn-treasury split for shop purchases. Half is
// destroyed forever, half goes to the house pool. Logs three rows:
// the shop_buy attribution, the burn, and the treasury.
export async function burnTreasurySplit(
  amountBps: number,
  opts: { player?: string; address?: string; meta?: Record<string, unknown> } = {},
) {
  if (amountBps <= 0) return { burned: 0, treasury: 0 };
  const burned = Math.floor(amountBps / 2);
  const treasury = amountBps - burned;
  await record("shop_buy", amountBps, opts);
  await record("burn", burned, opts);
  await record("treasury", treasury, opts);
  return { burned, treasury };
}

// Aggregate stats — circulating = mint - burn - treasury (locked).
export async function stats() {
  const rows = await prisma.econLedger.groupBy({
    by: ["kind"],
    _sum: { amountBps: true },
  });
  const sum = (k: string) =>
    rows.find((r) => r.kind === k)?._sum.amountBps ?? 0;
  const minted = sum("mint");
  const burned = sum("burn");
  const treasury = sum("treasury");
  const circulating = Math.max(0, minted - burned - treasury);
  return { minted, burned, treasury, circulating };
}
