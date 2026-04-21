import { Router, type Request, type Response } from "express";
import { read, MAX_ENERGY, REGEN_PER_MIN } from "../lib/energy.js";

export const energyRouter = Router();

// GET /api/energy/:player → { current, max, regenPerMin, lastRegenAt }
// Used by both the in-game /energy chat command and the refill page
// (so the player can confirm their energy before paying).
energyRouter.get("/:player", async (req: Request, res: Response) => {
  const raw = req.params.player;
  const player = typeof raw === "string" ? raw : "";
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(player)) {
    return res.status(400).json({ error: "bad player" });
  }
  try {
    const row = await read(player);
    res.json({
      player,
      current: row.current,
      max: MAX_ENERGY,
      regenPerMin: REGEN_PER_MIN,
      lastRegenAt: row.lastRegenAt,
    });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});
