import "dotenv/config";
import express from "express";
import { walletRouter } from "./routes/wallet.js";
import { rewardsRouter } from "./routes/rewards.js";
import { startScorer } from "./workers/scorer.js";
import { startMinter } from "./workers/minter.js";

const app = express();
app.use(express.json({ limit: "1mb" }));

app.get("/healthz", (_req, res) => res.json({ ok: true }));

app.use("/api/wallet", walletRouter);
app.use("/api/rewards", rewardsRouter);

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
  }
});
