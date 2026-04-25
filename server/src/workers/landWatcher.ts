import { prisma } from "../lib/prisma.js";
import { fetchInboundSince, publicKeyOrNull } from "../lib/solana.js";
import { matchPayment, expireStaleIntents } from "../lib/landRegistry.js";

const POLL_INTERVAL_MS = 30_000;

// Polls Solana for inbound treasury txs every 30s and walks them
// through the registry matcher. Also expires stale intents so plots
// don't sit "reserved" forever after a failed payment.
export function startLandWatcher() {
  const treasury = publicKeyOrNull(process.env.TREASURY_SOL_ADDRESS);
  if (!treasury) {
    console.warn("[landWatcher] TREASURY_SOL_ADDRESS unset — skipping");
    return null;
  }

  // We pull "since the last seen signature" — track that in-memory.
  // Bootstrap from the most recent SolanaPayment row on startup so a
  // restart doesn't re-scan months of history.
  let lastSignature: string | undefined;

  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      if (!lastSignature) {
        const last = await prisma.solanaPayment.findFirst({
          orderBy: { observedAt: "desc" },
          select: { signature: true },
        });
        lastSignature = last?.signature;
      }

      const payments = await fetchInboundSince(treasury, lastSignature, 50);
      for (const p of payments) {
        await matchPayment(p);
      }
      // Newest sig first in fetchInboundSince's return order; advance.
      if (payments[0]) lastSignature = payments[0].signature;

      const expired = await expireStaleIntents();
      if (payments.length > 0 || expired > 0) {
        console.log(`[landWatcher] processed ${payments.length} payment(s), expired ${expired} intent(s)`);
      }
    } catch (e) {
      console.error("[landWatcher] error", (e as Error).message);
    } finally {
      running = false;
    }
  };
  tick();
  return setInterval(tick, POLL_INTERVAL_MS);
}
