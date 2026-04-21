import { prisma } from "../lib/prisma.js";
import { publicClient, walletClient } from "../lib/chain.js";
import { bpsToWei } from "../lib/scoring.js";
import type { Address } from "viem";

const MINT_INTERVAL_MS = 30_000;
// Don't ship a tx just to mint $0.00002 of token. Flush when at least
// this much has accrued across all pending recipients combined.
const MIN_FLUSH_TOTAL_BPS = 500; // 0.05 RELM

const RELM_TOKEN_ABI = [
  {
    type: "function",
    name: "mintBatch",
    stateMutability: "nonpayable",
    inputs: [
      { name: "recipients", type: "address[]" },
      { name: "amounts", type: "uint256[]" },
    ],
    outputs: [],
  },
] as const;

type Aggregated = {
  address: Address;
  totalBps: number;
  eventIds: string[];
};

async function aggregateReady(): Promise<Aggregated[]> {
  // scored (scoreBps != null) + unminted (mintedAt IS NULL).
  const rows = await prisma.rewardEvent.findMany({
    where: { mintedAt: null, NOT: { scoreBps: null } },
    orderBy: { createdAt: "asc" },
    take: 5000,
  });
  const byAddr = new Map<string, Aggregated>();
  for (const r of rows) {
    if (!r.scoreBps || r.scoreBps <= 0) {
      // Zero-score events get marked minted immediately so we stop re-processing.
      continue;
    }
    const key = r.address.toLowerCase();
    const agg = byAddr.get(key) ?? {
      address: key as Address,
      totalBps: 0,
      eventIds: [],
    };
    agg.totalBps += r.scoreBps;
    agg.eventIds.push(r.id);
    byAddr.set(key, agg);
  }
  return Array.from(byAddr.values());
}

async function markZeroEventsMinted() {
  await prisma.rewardEvent.updateMany({
    where: { mintedAt: null, scoreBps: 0 },
    data: { mintedAt: new Date() },
  });
}

async function flushOnce() {
  await markZeroEventsMinted();

  const tokenAddr = process.env.RELM_TOKEN_ADDRESS as Address | undefined;
  if (!tokenAddr) {
    console.warn("[minter] RELM_TOKEN_ADDRESS not set — skipping");
    return;
  }
  if (!process.env.SIGNER_PRIVATE_KEY) {
    console.warn("[minter] SIGNER_PRIVATE_KEY not set — skipping");
    return;
  }

  const agg = await aggregateReady();
  if (agg.length === 0) return;
  const totalBps = agg.reduce((s, a) => s + a.totalBps, 0);
  if (totalBps < MIN_FLUSH_TOTAL_BPS) return;

  const recipients = agg.map((a) => a.address);
  const amounts = agg.map((a) => bpsToWei(a.totalBps));

  const wc = walletClient();
  const hash = await wc.writeContract({
    address: tokenAddr,
    abi: RELM_TOKEN_ABI,
    functionName: "mintBatch",
    args: [recipients, amounts],
  });
  console.log(`[minter] sent mintBatch tx=${hash} (${agg.length} recipients, ${totalBps} bps)`);

  // Wait for confirmation then mark the events minted. If the tx reverts,
  // we leave the events as-is; next tick retries.
  const receipt = await publicClient.waitForTransactionReceipt({ hash, confirmations: 1 });
  if (receipt.status !== "success") {
    console.error(`[minter] tx ${hash} reverted`);
    return;
  }

  const allIds = agg.flatMap((a) => a.eventIds);
  const minted = new Date();
  await prisma.rewardEvent.updateMany({
    where: { id: { in: allIds } },
    data: { mintedAt: minted, txHash: hash },
  });
  console.log(`[minter] confirmed ${hash}, marked ${allIds.length} events minted`);
}

export function startMinter() {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try { await flushOnce(); }
    catch (e) { console.error("[minter] error", e); }
    finally { running = false; }
  };
  setTimeout(tick, 3_000);
  return setInterval(tick, MINT_INTERVAL_MS);
}
