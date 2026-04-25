import { Router, type Request, type Response } from "express";
import { LAND_TIERS, tierOf } from "../lib/landTiers.js";
import {
  listAvailable,
  createIntent,
  ownerAt,
} from "../lib/landRegistry.js";
import { prisma } from "../lib/prisma.js";

export const landRouter = Router();

// GET /api/land/tiers
landRouter.get("/tiers", (_req: Request, res: Response) => {
  res.json({
    treasury: process.env.TREASURY_SOL_ADDRESS ?? null,
    tiers: Object.values(LAND_TIERS),
  });
});

// GET /api/land/available?tier=N
landRouter.get("/available", async (req: Request, res: Response) => {
  const tier = parseInt(String(req.query.tier ?? "1"), 10);
  if (!tierOf(tier)) return res.status(400).json({ error: "bad tier" });
  const plots = await listAvailable(tier);
  res.json({ tier, plots });
});

// POST /api/land/intent { plotId, player, solAddr? }
landRouter.post("/intent", async (req: Request, res: Response) => {
  const { plotId, player, solAddr } = (req.body ?? {}) as Record<string, unknown>;
  if (typeof plotId !== "string" || !plotId) return res.status(400).json({ error: "plotId required" });
  if (typeof player !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(player)) {
    return res.status(400).json({ error: "bad player" });
  }
  const treasury = process.env.TREASURY_SOL_ADDRESS;
  if (!treasury) return res.status(503).json({ error: "TREASURY_SOL_ADDRESS not configured" });
  try {
    const { intent, plot, tier } = await createIntent({
      plotId,
      player,
      solAddr: typeof solAddr === "string" ? solAddr : undefined,
    });
    res.json({
      memo: intent.memo,
      paymentAddress: treasury,
      priceSol: intent.priceSol,
      expiresAt: intent.expiresAt,
      plot: { id: plot.id, x: plot.x, z: plot.z, size: plot.size, tier: tier.id },
      instructions: `Send ${intent.priceSol} SOL to ${treasury} with memo "${intent.memo}".`,
    });
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

// GET /api/land/owned/:player — plots a player owns.
landRouter.get("/owned/:player", async (req: Request, res: Response) => {
  const player = String(req.params.player);
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(player)) return res.status(400).json({ error: "bad player" });
  const plots = await prisma.landPlot.findMany({
    where: { ownerPlayer: player, status: "owned" },
    orderBy: [{ tier: "desc" }, { claimedAt: "desc" }],
  });
  res.json({ player, plots });
});

// GET /api/land/at?x=&z= — ACL check used by the Lua mod on dig/place.
landRouter.get("/at", async (req: Request, res: Response) => {
  const x = parseInt(String(req.query.x ?? ""), 10);
  const z = parseInt(String(req.query.z ?? ""), 10);
  if (!Number.isInteger(x) || !Number.isInteger(z)) {
    return res.status(400).json({ error: "x and z required" });
  }
  const o = await ownerAt(x, z);
  res.json({ x, z, owner: o });
});
