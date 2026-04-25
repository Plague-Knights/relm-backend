import { Router, type Request, type Response } from "express";
import { read, MAX_ENERGY, REGEN_PER_MIN } from "../lib/energy.js";
import { readDaily } from "../lib/dailyCap.js";

export const energyRouter = Router();

// GET /api/energy/:player
//   → { current, max, regenPerMin, lastRegenAt,
//       earnedBps, capBps, day }
//
// Returns both the legacy energy meter (kept for the in-game /energy
// chat command and refill page) and the new daily-cap counter that
// actually gates rewards. Energy is informational now; daily cap is
// the source of truth for whether the next action earns RELM.
energyRouter.get("/:player", async (req: Request, res: Response) => {
  const raw = req.params.player;
  const player = typeof raw === "string" ? raw : "";
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(player)) {
    return res.status(400).json({ error: "bad player" });
  }
  try {
    const [row, daily] = await Promise.all([
      read(player),
      readDaily(player),
    ]);
    res.json({
      player,
      current: row.current,
      max: MAX_ENERGY,
      regenPerMin: REGEN_PER_MIN,
      lastRegenAt: row.lastRegenAt,
      day: daily.day,
      earnedBps: daily.earnedBps,
      capBps: daily.capBps,
      capRemainingBps: Math.max(0, daily.capBps - daily.earnedBps),
    });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});
