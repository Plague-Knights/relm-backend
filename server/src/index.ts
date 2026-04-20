import "dotenv/config";
import express from "express";
import { walletRouter } from "./routes/wallet.js";
import { rewardsRouter } from "./routes/rewards.js";

const app = express();
app.use(express.json({ limit: "1mb" }));

app.get("/healthz", (_req, res) => res.json({ ok: true }));

app.use("/api/wallet", walletRouter);
app.use("/api/rewards", rewardsRouter);

const PORT = Number(process.env.PORT ?? 3000);
app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`[relm-backend] listening on :${PORT}`);
});
