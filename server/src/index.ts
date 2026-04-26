import "dotenv/config";
import express from "express";
import { walletRouter } from "./routes/wallet.js";
import { rewardsRouter } from "./routes/rewards.js";
import { cosmeticsRouter } from "./routes/cosmetics.js";
import { energyRouter } from "./routes/energy.js";
import { landRouter } from "./routes/land.js";
import { arenaRouter } from "./routes/arena.js";
import { fightersRouter } from "./routes/fighters.js";
import { botMatchRouter } from "./routes/botMatch.js";
import { economyRouter } from "./routes/economy.js";
import { goRouter } from "./routes/go.js";
import { billingRouter, membershipRouter } from "./routes/billing.js";
import express2 from "express";
import { startScorer } from "./workers/scorer.js";
import { startMinter } from "./workers/minter.js";
import { startRefillWatcher } from "./workers/refillWatcher.js";
import { startLandWatcher } from "./workers/landWatcher.js";
import { startArenaWorker } from "./workers/arenaWorker.js";
import { startBotMatchWorker } from "./workers/botMatchWorker.js";
import { startLandTaxWorker } from "./workers/landTax.js";

const app = express();
// Trust the Railway edge proxy so rate-limiting keys off the real
// client IP rather than the Railway-internal address.
app.set("trust proxy", 1);
// Stripe webhook needs the raw body for signature verification, so it
// must be mounted BEFORE express.json swallows it. Same path is then
// re-handled by the JSON parser for any other route.
app.post("/api/billing/webhook", express2.raw({ type: "application/json" }), (req, res, next) => next());
app.use(express.json({ limit: "1mb" }));

app.get("/healthz", (_req, res) => res.json({ ok: true }));

app.use("/api/wallet", walletRouter);
app.use("/api/rewards", rewardsRouter);
app.use("/api/cosmetics", cosmeticsRouter);
app.use("/api/energy", energyRouter);
app.use("/api/land", landRouter);
app.use("/api/arena", arenaRouter);
app.use("/api/fighters", fightersRouter);
app.use("/api/bot-match", botMatchRouter);
app.use("/api/economy", economyRouter);
app.use("/go", goRouter);
app.use("/api/billing", billingRouter);
app.use("/api/membership", membershipRouter);

const PORT = Number(process.env.PORT ?? 3000);
app.listen(PORT, () => {
  console.log(`[relm-backend] listening on :${PORT}`);
  // Workers tick inline with the HTTP server. One interval loop each.
  // If this process is ever replicated we'll need a lock / leader
  // election, but for single-node dev + Railway one-instance deploys
  // this is fine.
  if (process.env.RELM_DISABLE_WORKERS !== "1") {
    startScorer();
    startMinter();
    startRefillWatcher();
    startLandWatcher();
    startArenaWorker();
    startBotMatchWorker();
    startLandTaxWorker();
  }
});
