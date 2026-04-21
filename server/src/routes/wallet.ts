import { Router, type Request, type Response } from "express";
import { prisma } from "../lib/prisma.js";
import { freshChallenge, verifyChallenge } from "../lib/siwe.js";
import { walletChallengeLimiter, walletConfirmLimiter } from "../lib/ratelimit.js";

export const walletRouter = Router();

// POST /api/wallet/challenge { player }
// Issues a one-time nonce + URL the player opens in their browser to
// connect a wallet and sign. Stored nonce gates /confirm.
walletRouter.post("/challenge", walletChallengeLimiter, async (req: Request, res: Response) => {
  const { player } = req.body ?? {};
  if (typeof player !== "string" || player.length === 0 || player.length > 64) {
    return res.status(400).json({ error: "player required" });
  }

  const baseUrl = process.env.PUBLIC_BASE_URL ?? `http://localhost:${process.env.PORT ?? 3000}`;
  const { hostname } = new URL(baseUrl);
  const { nonce, message, expiresAt } = freshChallenge(player, hostname, baseUrl);

  await prisma.walletChallenge.create({ data: { player, nonce, expiresAt } });

  return res.json({
    url: `${baseUrl}/link?player=${encodeURIComponent(player)}&nonce=${nonce}`,
    nonce,
    message,
    expiresAt,
  });
});

// POST /api/wallet/confirm { player, address, token, message, signature }
// The in-game `/wallet-set <addr> <token>` flow calls this after the
// browser returned a token. `token` IS the nonce, re-echoed — the
// signature + message are what actually authorize the bind.
walletRouter.post("/confirm", walletConfirmLimiter, async (req: Request, res: Response) => {
  const { player, address, token, message, signature } = req.body ?? {};
  if (
    typeof player !== "string" ||
    typeof address !== "string" ||
    typeof token !== "string" ||
    typeof message !== "string" ||
    typeof signature !== "string"
  ) {
    return res.status(400).json({ error: "missing fields" });
  }

  const challenge = await prisma.walletChallenge.findUnique({ where: { nonce: token } });
  if (!challenge || challenge.consumed || challenge.player !== player) {
    return res.status(400).json({ error: "challenge invalid" });
  }
  if (challenge.expiresAt < new Date()) {
    return res.status(400).json({ error: "challenge expired" });
  }

  let recovered: `0x${string}`;
  try {
    recovered = await verifyChallenge(message, signature as `0x${string}`, challenge.nonce);
  } catch (e) {
    return res.status(400).json({ error: (e as Error).message });
  }

  if (recovered.toLowerCase() !== address.toLowerCase()) {
    return res.status(400).json({ error: "address / signature mismatch" });
  }

  // Unique constraint on address blocks a wallet from being bound to
  // a second player. If it's already ours, treat as idempotent.
  const existing = await prisma.playerWallet.findUnique({ where: { address: recovered } });
  if (existing && existing.player !== player) {
    return res.status(409).json({ error: "wallet already bound to another player" });
  }

  await prisma.$transaction([
    prisma.playerWallet.upsert({
      where: { player },
      create: { player, address: recovered },
      update: { address: recovered, linkedAt: new Date() },
    }),
    prisma.walletChallenge.update({ where: { id: challenge.id }, data: { consumed: true } }),
  ]);

  return res.json({ ok: true, address: recovered });
});
