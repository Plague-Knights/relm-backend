import "dotenv/config";
import express from "express";
import { walletRouter } from "./routes/wallet.js";
import { rewardsRouter } from "./routes/rewards.js";
import { cosmeticsRouter } from "./routes/cosmetics.js";
import { energyRouter } from "./routes/energy.js";
import { landRouter } from "./routes/land.js";
import { startScorer } from "./workers/scorer.js";
import { startMinter } from "./workers/minter.js";
import { startRefillWatcher } from "./workers/refillWatcher.js";
import { startLandWatcher } from "./workers/landWatcher.js";

const app = express();
// Trust the Railway edge proxy so rate-limiting keys off the real
// client IP rather than the Railway-internal address.
app.set("trust proxy", 1);
app.use(express.json({ limit: "1mb" }));

app.get("/healthz", (_req, res) => res.json({ ok: true }));

app.use("/api/wallet", walletRouter);
app.use("/api/rewards", rewardsRouter);
app.use("/api/cosmetics", cosmeticsRouter);
app.use("/api/energy", energyRouter);
app.use("/api/land", landRouter);

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
  }
});
