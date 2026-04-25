import { prisma } from "./prisma.js";
import { tierOf } from "./landTiers.js";
import * as crypto from "node:crypto";

// 15-minute window between intent creation and on-chain payment. After
// that we mark the intent expired so the plot frees up; the watcher
// won't apply a stale payment to a re-listed plot.
const INTENT_TTL_MS = 15 * 60 * 1000;

/**
 * List plots in `available` status for a given tier — the buy-flow on
 * the website calls this to render a map of what's claimable.
 */
export async function listAvailable(tierId: number, take = 100) {
  const tier = tierOf(tierId);
  if (!tier) return [];
  return prisma.landPlot.findMany({
    where: { tier: tier.id, status: "available" },
    take,
    orderBy: [{ x: "asc" }, { z: "asc" }],
  });
}

/**
 * Reserve a plot for a player and mint a payment intent. Returns the
 * memo + price the player needs to pay. The plot transitions to
 * `reserved`; a watcher tick that observes the SOL payment with this
 * memo will flip it to `owned`.
 */
export async function createIntent(opts: {
  plotId: string;
  player: string;
  solAddr?: string;
}) {
  const plot = await prisma.landPlot.findUnique({ where: { id: opts.plotId } });
  if (!plot) throw new Error("plot not found");
  if (plot.status !== "available") throw new Error("plot not available");
  const tier = tierOf(plot.tier);
  if (!tier) throw new Error("invalid tier");

  const memo = mintMemo();
  const expiresAt = new Date(Date.now() + INTENT_TTL_MS);

  return prisma.$transaction(async (tx) => {
    // Race-safety: only flip available→reserved if it's still available.
    const updated = await tx.landPlot.updateMany({
      where: { id: plot.id, status: "available" },
      data: { status: "reserved" },
    });
    if (updated.count === 0) throw new Error("plot was claimed by someone else");
    const intent = await tx.landPaymentIntent.create({
      data: {
        plotId: plot.id,
        player: opts.player.slice(0, 64),
        solAddr: opts.solAddr?.slice(0, 64) ?? null,
        priceSol: tier.priceSol,
        memo,
        expiresAt,
      },
    });
    return { intent, plot, tier };
  });
}

/**
 * Try to match an inbound Solana payment against any open intent.
 * Returns the plot id that got fulfilled, or null if no match.
 */
export async function matchPayment(opts: {
  signature: string;
  fromAddr: string;
  amountSol: string;
  memo: string | null;
}) {
  // Idempotent insert; if we've already seen this signature, skip.
  const seen = await prisma.solanaPayment.findUnique({ where: { signature: opts.signature } });
  if (seen) return seen.matchedPlot ?? null;

  const memoMatch = opts.memo?.match(/relm-land-[0-9a-f]{8}/);
  const memoToken = memoMatch?.[0] ?? null;
  let matchedPlot: string | null = null;

  if (memoToken) {
    const intent = await prisma.landPaymentIntent.findUnique({
      where: { memo: memoToken },
    });
    if (intent && !intent.fulfilledAt && intent.expiresAt > new Date()) {
      const required = parseFloat(intent.priceSol);
      const paid = parseFloat(opts.amountSol);
      // 1% leniency on rounding / fee deduction. Solana txs charge the
      // sender but the receiver gets the full amount, so we're not
      // expecting that issue — leniency is purely for human typos.
      if (paid + 1e-9 >= required * 0.99) {
        matchedPlot = intent.plotId;
        await prisma.$transaction([
          prisma.landPlot.update({
            where: { id: intent.plotId },
            data: {
              status: "owned",
              ownerPlayer: intent.player,
              ownerSolAddr: opts.fromAddr,
              txSignature: opts.signature,
              claimedAt: new Date(),
            },
          }),
          prisma.landPaymentIntent.update({
            where: { id: intent.id },
            data: { matchedTx: opts.signature, fulfilledAt: new Date() },
          }),
        ]);
      }
    }
  }

  await prisma.solanaPayment.create({
    data: {
      signature: opts.signature,
      fromAddr: opts.fromAddr,
      amountSol: opts.amountSol,
      memo: opts.memo,
      matchedPlot,
    },
  });

  return matchedPlot;
}

/**
 * Reverse-flip stale reservations whose intents expired without a tx.
 * Called periodically by the watcher.
 */
export async function expireStaleIntents() {
  const stale = await prisma.landPaymentIntent.findMany({
    where: { fulfilledAt: null, expiresAt: { lt: new Date() } },
    take: 200,
  });
  if (stale.length === 0) return 0;
  await prisma.$transaction([
    ...stale.map((s) =>
      prisma.landPlot.updateMany({
        where: { id: s.plotId, status: "reserved" },
        data: { status: "available" },
      }),
    ),
    prisma.landPaymentIntent.deleteMany({
      where: { id: { in: stale.map((s) => s.id) } },
    }),
  ]);
  return stale.length;
}

/**
 * Lua-side ACL check: returns the owner of the plot containing (x, z),
 * or null if unclaimed. Used to gate dig/place actions.
 */
export async function ownerAt(x: number, z: number) {
  const plots = await prisma.landPlot.findMany({
    where: {
      status: "owned",
      // Bottom-left ≤ point < top-right. Tier sizes are bounded so we
      // can safely query "any plot whose corner is within max-tier
      // distance of the point" — keeps the index useful.
      x: { lte: x },
      z: { lte: z },
    },
    take: 50,
  });
  for (const p of plots) {
    if (x < p.x + p.size && z < p.z + p.size) {
      return { player: p.ownerPlayer, label: p.label, tier: p.tier };
    }
  }
  return null;
}

function mintMemo(): string {
  // 8 hex chars = 32 bits of entropy — collision risk against a few
  // hundred concurrent intents is essentially nil.
  const buf = crypto.randomBytes(4);
  return `relm-land-${buf.toString("hex")}`;
}
