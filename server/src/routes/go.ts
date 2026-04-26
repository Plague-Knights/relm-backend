// /go/<key>?n=<niche>&s=<source> — partner-link redirect with attribution.
// Bio tiles + captions route through this so every click logs a row in
// RefClick (key, niche, source, referer, UA). Lets us split-test which
// niches + channels actually convert.

import { Router, type Request, type Response } from "express";
import { prisma } from "../lib/prisma.js";

export const goRouter = Router();

// Edit-this map of key → destination. Keep keys URL-safe.
const PARTNER_URLS: Record<string, string> = {
  gambulls: "https://gambulls.com/?ref=realglitchd",
  dealdraft: "https://dealdraft.net/?ref=glitchdgamba",
};

goRouter.get("/:key", async (req: Request, res: Response) => {
  const key = String(req.params.key ?? "").toLowerCase();
  const url = PARTNER_URLS[key];
  if (!url) return res.status(404).send("unknown key");
  // Best-effort logging — never block the redirect on it.
  prisma.refClick.create({
    data: {
      key,
      niche: typeof req.query.n === "string" ? req.query.n.slice(0, 32) : null,
      source: typeof req.query.s === "string" ? req.query.s.slice(0, 32) : null,
      referer: req.get("referer")?.slice(0, 300) ?? null,
      ua: req.get("user-agent")?.slice(0, 200) ?? null,
      ip: (req.ip ?? "").slice(0, 64),
    },
  }).catch(() => {});
  res.redirect(302, url);
});

goRouter.get("/", async (_req: Request, res: Response) => {
  // Lightweight stats endpoint for the bio page (and an admin view).
  const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const rows = await prisma.refClick.groupBy({
    by: ["key", "source"],
    _count: { _all: true },
    where: { createdAt: { gte: last24h } },
  });
  res.json({
    since: last24h.toISOString(),
    clicks: rows.map((r) => ({
      key: r.key,
      source: r.source,
      count: r._count._all,
    })),
  });
});
