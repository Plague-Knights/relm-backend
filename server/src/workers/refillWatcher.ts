import { prisma } from "../lib/prisma.js";
import { publicClient } from "../lib/chain.js";
import { credit } from "../lib/energy.js";
import type { Address } from "viem";

const REFILL_ABI = [
  {
    type: "event", name: "Refilled", inputs: [
      { indexed: true, name: "player", type: "address" },
      { indexed: false, name: "amount", type: "uint256" },
      { indexed: false, name: "paid", type: "uint256" },
    ],
  },
] as const;

const POLL_INTERVAL_MS = 15_000;

function refillAddress(): Address | null {
  const a = process.env.RELM_REFILL_ADDRESS;
  return a ? (a as Address) : null;
}

// Track the last block we've scanned so we don't re-walk history every
// tick. Persisted across restarts in a tiny dedicated row by abusing
// the EnergyRefill table — cleanest spot since they're tightly coupled.
async function lastScannedBlock(): Promise<bigint> {
  const row = await prisma.energyRefill.findFirst({
    orderBy: { createdAt: "desc" },
  });
  if (row?.txHash?.startsWith("__cursor:")) {
    return BigInt(row.txHash.slice("__cursor:".length));
  }
  // Fallback: rewind 1000 blocks so a cold start doesn't miss recent
  // refills but also doesn't cost a full chain scan.
  const head = await publicClient.getBlockNumber();
  return head > 1000n ? head - 1000n : 0n;
}

async function setLastScannedBlock(block: bigint) {
  await prisma.energyRefill.upsert({
    where: { txHash: "__cursor:" + block.toString() },
    update: {},
    create: {
      player: "__cursor",
      address: "__cursor",
      amount: 0,
      txHash: "__cursor:" + block.toString(),
    },
  });
  // Drop older cursors so the table doesn't grow forever.
  await prisma.energyRefill.deleteMany({
    where: { player: "__cursor", txHash: { not: "__cursor:" + block.toString() } },
  });
}

async function pollOnce() {
  const addr = refillAddress();
  if (!addr) return;

  const head = await publicClient.getBlockNumber();
  const from = await lastScannedBlock();
  if (from > head) return;

  const logs = await publicClient.getLogs({
    address: addr,
    event: REFILL_ABI[0],
    fromBlock: from,
    toBlock: head,
  });

  for (const log of logs) {
    if (!log.transactionHash) continue;
    const player = log.args.player as Address;
    const amount = Number(log.args.amount as bigint);

    // Idempotent: txHash unique constraint blocks duplicate credits.
    try {
      // Map address → player username via PlayerWallet.
      const wallet = await prisma.playerWallet.findUnique({ where: { address: player.toLowerCase() } });
      if (!wallet) {
        console.warn(`[refill-watcher] no PlayerWallet for ${player}, skipping`);
        continue;
      }
      await prisma.energyRefill.create({
        data: {
          player: wallet.player,
          address: player.toLowerCase(),
          amount,
          txHash: log.transactionHash,
        },
      });
      await credit(wallet.player, amount);
      console.log(`[refill-watcher] credited ${amount} energy to ${wallet.player} (${player}) tx=${log.transactionHash}`);
    } catch (e) {
      // Most likely the unique-constraint hit (already processed).
      const msg = (e as Error).message;
      if (!msg.includes("Unique") && !msg.includes("unique")) {
        console.error("[refill-watcher] error processing log", e);
      }
    }
  }

  await setLastScannedBlock(head);
}

export function startRefillWatcher() {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try { await pollOnce(); }
    catch (e) { console.error("[refill-watcher] error", e); }
    finally { running = false; }
  };
  setTimeout(tick, 5_000);
  return setInterval(tick, POLL_INTERVAL_MS);
}
