import { Router, type Request, type Response } from "express";
import { prisma } from "../lib/prisma.js";

export const rewardsRouter = Router();

// POST /api/rewards/ingest { events: [{ player, address, kind, payload, t }] }
// The Lua mod batches and flushes every 5s. We accept, bounds-check,
// and store — scoring runs separately so ingest stays fast and the
// mod can keep its timer loop short.
//
// Auth: `X-Relm-Secret` header must match RELM_BACKEND_SECRET. That's
// shared between the server and the modpack's minetest.conf, and it
// stops randoms from posting fake events at the open endpoint.
rewardsRouter.post("/ingest", async (req: Request, res: Response) => {
  const secret = req.header("x-relm-secret");
  if (!secret || secret !== process.env.RELM_BACKEND_SECRET) {
    return res.status(401).json({ error: "bad secret" });
  }

  const { events } = req.body ?? {};
  if (!Array.isArray(events)) return res.status(400).json({ error: "events array required" });
  if (events.length === 0) return res.json({ ok: true, count: 0 });
  if (events.length > 1000) return res.status(413).json({ error: "batch too large" });

  const rows = [];
  for (const e of events) {
    if (
      typeof e.player !== "string" ||
      typeof e.address !== "string" ||
      typeof e.kind !== "string"
    ) continue;
    rows.push({
      player: e.player.slice(0, 64),
      address: e.address.toLowerCase().slice(0, 42),
      kind: e.kind.slice(0, 32),
      payload: JSON.stringify(e.payload ?? null),
    });
  }

  await prisma.rewardEvent.createMany({ data: rows });
  return res.json({ ok: true, count: rows.length });
});
