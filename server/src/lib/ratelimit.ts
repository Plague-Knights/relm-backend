import rateLimit from "express-rate-limit";

// Tuned for the typical Relm access pattern:
// - /wallet-link is rare — a player runs it once per session, maybe
//   twice if they typo the /wallet-set response. 5/min/IP is plenty.
// - /rewards/ingest is called every ~5s per active Luanti server,
//   batched. 60/min/IP leaves headroom for multiple connected worlds
//   behind the same NAT without throttling real play.
// - /wallet/confirm is post-signature; 30/min/IP absorbs retry loops
//   while blocking bruteforce on the nonce.

export const walletChallengeLimiter = rateLimit({
  windowMs: 60_000,
  limit: 5,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "too many challenge requests — slow down" },
});

export const walletConfirmLimiter = rateLimit({
  windowMs: 60_000,
  limit: 30,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "too many confirm attempts" },
});

export const rewardsIngestLimiter = rateLimit({
  windowMs: 60_000,
  limit: 60,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "ingest flood — back off" },
});
