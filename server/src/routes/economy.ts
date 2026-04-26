// RELM-economy routes. Pure sinks that don't fit elsewhere:
//   * mine-cap unlock — pay X RELM to extend today's daily cap by 50%
//   * ore convert    — turn raw ore (server-side accounting in meta)
//                      into RELM with a 5% conversion fee burned
//   * stats          — circulating / burned / treasury for the dashboard
//
// All charges flow through econ.burnTreasurySplit so 50% of every
// sink is permanently destroyed.

import { Router, type Request, type Response } from "express";
import { prisma } from "../lib/prisma.js";
import * as balance from "../lib/balance.js";
import * as econ from "../lib/econ.js";

export const economyRouter = Router();

// Daily mine-cap unlock — costs a flat 250 RELM (2,500,000 bps), grants
// the player a `capBoost` of +50% to their dailyCap for the rest of the
// day. Stored as an EconLedger row (kind=cap_boost) that lib/dailyCap
// reads when computing today's effective cap.
const CAP_UNLOCK_BPS = 250 * 10000;

economyRouter.post("/cap-unlock", async (req: Request, res: Response) => {
  const { player } = (req.body ?? {}) as { player?: string };
  if (typeof player !== "string" || !player.trim()) {
    return res.status(400).json({ error: "player required" });
  }
  const newBal = await balance.debit(player.trim(), CAP_UNLOCK_BPS);
  if (newBal === null) {
    return res.status(402).json({ error: "insufficient RELM balance", priceBps: CAP_UNLOCK_BPS });
  }
  const { burned, treasury } = await econ.burnTreasurySplit(CAP_UNLOCK_BPS, {
    player,
    meta: { kind: "cap_unlock" },
  });
  return res.json({
    ok: true,
    priceBps: CAP_UNLOCK_BPS,
    burnedBps: burned,
    treasuryBps: treasury,
    balanceBps: newBal,
  });
});

// Ore conversion — players accumulate raw ore counts on the server-
// side OreInventory tally (mod posts {dignode: ore_X} and we count it
// instead of immediately converting to RELM). When they hit /convert,
// we look up the ore tier from the scoring table and credit RELM with
// 5% burn cut.
//
// For the v1 we accept the count from the mod via a simple body. The
// next iteration will read from a real OreInventory table.
const ORE_PRICE_BPS: Record<string, number> = {
  "default:stone_with_coal":    250,
  "default:stone_with_iron":    700,
  "default:stone_with_gold":   1800,
  "default:stone_with_diamond": 7500,
  "relm_core:coal_ore":          250,
  "relm_core:iron_ore":          700,
  "relm_core:gold_ore":         1800,
  "relm_core:ink_ore":          7500,
};

const ORE_BURN_BPS = 0.05;

economyRouter.post("/convert", async (req: Request, res: Response) => {
  const { player, ore } = (req.body ?? {}) as { player?: string; ore?: Record<string, number> };
  if (typeof player !== "string" || !player.trim()) {
    return res.status(400).json({ error: "player required" });
  }
  if (!ore || typeof ore !== "object") {
    return res.status(400).json({ error: "ore mapping required" });
  }
  let grossBps = 0;
  for (const [name, countRaw] of Object.entries(ore)) {
    const price = ORE_PRICE_BPS[name];
    if (!price) continue;
    const count = Math.max(0, Math.floor(Number(countRaw) || 0));
    grossBps += price * count;
  }
  if (grossBps <= 0) {
    return res.status(400).json({ error: "no convertible ore" });
  }
  const burnBps = Math.floor(grossBps * ORE_BURN_BPS);
  const netBps = grossBps - burnBps;
  await balance.credit(player.trim(), netBps);
  await econ.record("mint", netBps, { player, meta: { kind: "ore_convert" } });
  await econ.record("burn", burnBps, { player, meta: { kind: "ore_convert_fee" } });
  return res.json({
    ok: true,
    grossBps,
    burnedBps: burnBps,
    creditedBps: netBps,
  });
});

economyRouter.get("/stats", async (_req: Request, res: Response) => {
  res.json(await econ.stats());
});

economyRouter.get("/balance/:player", async (req: Request, res: Response) => {
  const player = typeof req.params.player === "string" ? req.params.player : "";
  if (!player) return res.status(400).json({ error: "bad player" });
  res.json({ player, balanceBps: await balance.get(player) });
});

economyRouter.get("/recent/:limit?", async (req: Request, res: Response) => {
  const lim = Math.min(50, Math.max(1, Number(req.params.limit) || 20));
  const rows = await prisma.econLedger.findMany({
    orderBy: { createdAt: "desc" },
    take: lim,
  });
  res.json({
    rows: rows.map(r => ({
      kind: r.kind,
      amountBps: r.amountBps,
      player: r.player,
      address: r.address,
      meta: r.meta ? JSON.parse(r.meta) : null,
      createdAt: r.createdAt,
    })),
  });
});
