// /api/shop/* — Stripe-paid cosmetic store. Replaces the on-chain
// RelmCosmetic flow. Items live in this file (cheaper than a DB table
// for ~20-50 items; promote to DB once we cross that). Each click =
// Stripe Checkout in payment (one-time) mode. Webhook in billing.ts
// is the source of truth: when a checkout.session.completed event
// arrives with mode=payment, we credit a PlayerCosmetic row.

import { Router, type Request, type Response } from "express";
import Stripe from "stripe";
import { prisma } from "../lib/prisma.js";

export const shopRouter = Router();

const STRIPE_KEY = process.env.STRIPE_SECRET_KEY ?? "";
const PUBLIC_BASE = process.env.PUBLIC_LINK_URL ?? "https://relm-link-production.up.railway.app";
const stripe = STRIPE_KEY ? new Stripe(STRIPE_KEY) : null;

const PLAYER_RE = /^[A-Za-z0-9_-]{1,64}$/;

export type CosmeticItem = {
  id: string;
  name: string;
  description: string;
  image: string;
  slot: "cape" | "trail" | "pickaxe_skin" | "axe_skin" | "name_color" | "emote";
  rarity: "common" | "uncommon" | "rare" | "epic" | "legendary";
  priceUsd: number;          // dollars, displayed; stripe charges in cents
  perks?: string[];
  // Stripe price id for the one-time charge. Stored in env so prices
  // can be edited via the Stripe dashboard, not via redeploy.
  stripeEnvKey: string;
};

// Edit this list to add/remove items. Match each stripeEnvKey to a
// price id in Stripe (Products → Pricing → one-time).
export const CATALOG: CosmeticItem[] = [
  {
    id: "cape-crimson",
    name: "Crimson Cape",
    description: "Flowing crimson cape — purely cosmetic.",
    image: "/shop/img/cape-crimson.svg",
    slot: "cape", rarity: "common",
    priceUsd: 1.99,
    stripeEnvKey: "STRIPE_PRICE_CAPE_CRIMSON",
  },
  {
    id: "trail-cobalt",
    name: "Cobalt Particle Trail",
    description: "Soft blue trail behind your steps.",
    image: "/shop/img/trail-cobalt.svg",
    slot: "trail", rarity: "uncommon",
    priceUsd: 3.99,
    stripeEnvKey: "STRIPE_PRICE_TRAIL_COBALT",
  },
  {
    id: "pick-iron-darkfinish",
    name: "Iron Pickaxe — Dark Finish",
    description: "Reskin for the iron pickaxe. Kept on death.",
    image: "/shop/img/pick-iron.svg",
    slot: "pickaxe_skin", rarity: "rare",
    priceUsd: 6.99,
    perks: ["Kept on Death"],
    stripeEnvKey: "STRIPE_PRICE_PICK_IRON_DARK",
  },
  {
    id: "pick-founder-gold",
    name: "Founder Pickaxe (Gold)",
    description: "Unbreakable gold pickaxe. Soulbound. Limited to first 100 supporters.",
    image: "/shop/img/pick-founder.svg",
    slot: "pickaxe_skin", rarity: "legendary",
    priceUsd: 49.99,
    perks: ["Unbreakable", "Kept on Death", "Soulbound", "Founder"],
    stripeEnvKey: "STRIPE_PRICE_PICK_FOUNDER",
  },
  {
    id: "name-gold",
    name: "Gold Name Color",
    description: "Your name in chat + above your head renders gold.",
    image: "/shop/img/name-gold.svg",
    slot: "name_color", rarity: "uncommon",
    priceUsd: 2.99,
    stripeEnvKey: "STRIPE_PRICE_NAME_GOLD",
  },
];

shopRouter.get("/list", async (_req: Request, res: Response) => {
  res.json({
    items: CATALOG.map((c) => ({
      id: c.id, name: c.name, description: c.description, image: c.image,
      slot: c.slot, rarity: c.rarity, priceUsd: c.priceUsd, perks: c.perks ?? [],
      buyable: !!process.env[c.stripeEnvKey],
    })),
  });
});

shopRouter.get("/owned/:player", async (req: Request, res: Response) => {
  const player = typeof req.params.player === "string" ? req.params.player : "";
  if (!PLAYER_RE.test(player)) return res.status(400).json({ error: "bad player" });
  const owned = await prisma.playerCosmetic.findMany({
    where: { player },
    orderBy: { acquiredAt: "desc" },
  });
  res.json({
    player,
    items: owned.map((o) => ({
      cosmeticId: o.cosmeticId,
      acquiredAt: o.acquiredAt.toISOString(),
    })),
  });
});

shopRouter.post("/checkout", async (req: Request, res: Response) => {
  if (!stripe) return res.status(503).json({ error: "stripe not configured" });
  const { player, cosmeticId } = (req.body ?? {}) as { player?: string; cosmeticId?: string };
  if (typeof player !== "string" || !PLAYER_RE.test(player)) {
    return res.status(400).json({ error: "bad player" });
  }
  if (typeof cosmeticId !== "string") {
    return res.status(400).json({ error: "cosmeticId required" });
  }
  const item = CATALOG.find((c) => c.id === cosmeticId);
  if (!item) return res.status(404).json({ error: "unknown cosmetic" });
  const priceId = process.env[item.stripeEnvKey];
  if (!priceId) return res.status(503).json({ error: "this item is not yet for sale" });

  // Already owns it?
  const exists = await prisma.playerCosmetic.findUnique({
    where: { player_cosmeticId: { player, cosmeticId } },
  }).catch(() => null);
  if (exists) return res.status(409).json({ error: "you already own this item" });

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${PUBLIC_BASE}/shop?bought=${encodeURIComponent(cosmeticId)}`,
    cancel_url: `${PUBLIC_BASE}/shop?canceled=1`,
    client_reference_id: `cosmetic:${cosmeticId}:${player}`,
    metadata: { player, cosmeticId },
  });
  res.json({ url: session.url });
});
