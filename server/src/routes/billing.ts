// Stripe billing — checkout session creation + webhook receiver +
// resolved-tier lookup. Three tiers:
//   free      — default, no payment
//   premium   — STRIPE_PRICE_PREMIUM (e.g. $9.99/mo)
//   vip       — STRIPE_PRICE_VIP     (e.g. $29.99/mo)
//
// The lua mod calls GET /api/membership/:player on join to find out
// what pickaxe + perks to apply. Tier is whatever the user's most
// recent active Subscription says, falling back to "free".

import { Router, type Request, type Response } from "express";
import Stripe from "stripe";
import { prisma } from "../lib/prisma.js";

export const billingRouter = Router();

const STRIPE_KEY = process.env.STRIPE_SECRET_KEY ?? "";
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET ?? "";
const PRICE_PREMIUM = process.env.STRIPE_PRICE_PREMIUM ?? "";
const PRICE_VIP = process.env.STRIPE_PRICE_VIP ?? "";
const PUBLIC_BASE = process.env.PUBLIC_LINK_URL ?? "https://relm-link-production.up.railway.app";

const stripe = STRIPE_KEY ? new Stripe(STRIPE_KEY) : null;

const TIER_FOR_PRICE: Record<string, string> = {};
if (PRICE_PREMIUM) TIER_FOR_PRICE[PRICE_PREMIUM] = "premium";
if (PRICE_VIP) TIER_FOR_PRICE[PRICE_VIP] = "vip";

const PLAYER_RE = /^[A-Za-z0-9_-]{1,64}$/;

// POST /api/billing/checkout { player, tier } → { url }
billingRouter.post("/checkout", async (req: Request, res: Response) => {
  if (!stripe) return res.status(503).json({ error: "stripe not configured" });
  const { player, tier } = (req.body ?? {}) as { player?: string; tier?: string };
  if (typeof player !== "string" || !PLAYER_RE.test(player)) {
    return res.status(400).json({ error: "bad player" });
  }
  let priceId = "";
  if (tier === "premium") priceId = PRICE_PREMIUM;
  else if (tier === "vip") priceId = PRICE_VIP;
  if (!priceId) return res.status(400).json({ error: "unknown tier" });

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${PUBLIC_BASE}/play?subscribed=1`,
    cancel_url: `${PUBLIC_BASE}/play?canceled=1`,
    client_reference_id: player,
    metadata: { player, tier: tier ?? "" },
  });
  res.json({ url: session.url });
});

// POST /api/billing/webhook  (raw body required; index.ts mounts a
// stripe-specific raw-body parser before this route)
billingRouter.post("/webhook", async (req: Request, res: Response) => {
  if (!stripe || !STRIPE_WEBHOOK_SECRET) return res.status(503).end();
  const sig = req.header("stripe-signature");
  if (!sig) return res.status(400).end();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(req.body as Buffer, sig, STRIPE_WEBHOOK_SECRET);
  } catch (e) {
    return res.status(400).send(`webhook signature: ${(e as Error).message}`);
  }

  try {
    if (event.type === "checkout.session.completed") {
      const s = event.data.object as Stripe.Checkout.Session;
      // Two flows hit this event: subscription mode (player as
      // client_reference_id) and shop one-time mode (cosmetic:<id>:<player>).
      const ref = s.client_reference_id ?? "";
      if (ref.startsWith("cosmetic:")) {
        // One-time cosmetic purchase. Credit ownership.
        const [, cosmeticId, player] = ref.split(":");
        if (cosmeticId && player) {
          const pi = typeof s.payment_intent === "string"
            ? s.payment_intent
            : s.payment_intent?.id ?? null;
          await prisma.playerCosmetic.upsert({
            where: { player_cosmeticId: { player, cosmeticId } },
            create: { player, cosmeticId, stripePaymentIntent: pi },
            update: { stripePaymentIntent: pi },
          });
        }
        return res.json({ received: true });
      }
      const player = ref;
      const subId = typeof s.subscription === "string" ? s.subscription : s.subscription?.id ?? "";
      if (player && subId && stripe) {
        const sub = await stripe.subscriptions.retrieve(subId);
        const item = sub.items.data[0];
        const priceId = item?.price.id ?? "";
        const tier = TIER_FOR_PRICE[priceId] ?? "premium";
        const periodEnd = item?.current_period_end ?? null;
        await prisma.subscription.upsert({
          where: { stripeSubscriptionId: subId },
          create: {
            player,
            email: s.customer_details?.email ?? null,
            tier,
            status: sub.status,
            stripeCustomerId: typeof sub.customer === "string" ? sub.customer : sub.customer.id,
            stripeSubscriptionId: subId,
            stripePriceId: priceId,
            currentPeriodEnd: periodEnd ? new Date(periodEnd * 1000) : null,
            cancelAtPeriodEnd: sub.cancel_at_period_end,
          },
          update: {
            tier,
            status: sub.status,
            stripePriceId: priceId,
            currentPeriodEnd: periodEnd ? new Date(periodEnd * 1000) : null,
            cancelAtPeriodEnd: sub.cancel_at_period_end,
          },
        });
      }
    } else if (event.type === "customer.subscription.updated"
        || event.type === "customer.subscription.deleted") {
      const sub = event.data.object as Stripe.Subscription;
      const item = sub.items.data[0];
      const priceId = item?.price.id ?? "";
      const tier = TIER_FOR_PRICE[priceId] ?? "premium";
      const periodEnd = item?.current_period_end ?? null;
      await prisma.subscription.update({
        where: { stripeSubscriptionId: sub.id },
        data: {
          tier: sub.status === "canceled" ? "free" : tier,
          status: sub.status,
          stripePriceId: priceId,
          currentPeriodEnd: periodEnd ? new Date(periodEnd * 1000) : null,
          cancelAtPeriodEnd: sub.cancel_at_period_end,
        },
      }).catch(() => {});
    }
    res.json({ received: true });
  } catch (e) {
    console.error("[billing webhook]", (e as Error).message);
    res.status(500).end();
  }
});

// GET /api/membership/:player → resolved entitlement tier
export const membershipRouter = Router();
membershipRouter.get("/:player", async (req: Request, res: Response) => {
  const player = typeof req.params.player === "string" ? req.params.player : "";
  if (!PLAYER_RE.test(player)) return res.status(400).json({ error: "bad player" });
  const sub = await prisma.subscription.findFirst({
    where: { player, status: "active" },
    orderBy: { updatedAt: "desc" },
  });
  res.json({
    player,
    tier: sub?.tier ?? "free",
    status: sub?.status ?? "none",
    currentPeriodEnd: sub?.currentPeriodEnd?.toISOString() ?? null,
  });
});
