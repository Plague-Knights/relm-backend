import { publicClient } from "./chain.js";
import type { Address } from "viem";

const COSMETIC_ABI = [
  {
    type: "function", name: "nextTypeId", stateMutability: "view",
    inputs: [], outputs: [{ type: "uint256" }],
  },
  {
    type: "function", name: "cosmeticTypes", stateMutability: "view",
    inputs: [{ type: "uint256" }],
    outputs: [
      { name: "priceWei", type: "uint256" },
      { name: "active", type: "bool" },
      { name: "metadataURI", type: "string" },
      { name: "maxSupply", type: "uint256" },
      { name: "minted", type: "uint256" },
    ],
  },
  {
    type: "function", name: "balanceOf", stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  // ERC-721 Transfer log we use to enumerate ownership cheaply.
  {
    type: "event", name: "Transfer", inputs: [
      { indexed: true, name: "from", type: "address" },
      { indexed: true, name: "to", type: "address" },
      { indexed: true, name: "tokenId", type: "uint256" },
    ],
  },
  {
    type: "function", name: "tokenIdToType", stateMutability: "view",
    inputs: [{ type: "uint256" }], outputs: [{ type: "uint256" }],
  },
] as const;

function shopAddress(): Address {
  const a = process.env.RELM_COSMETIC_ADDRESS;
  if (!a) throw new Error("RELM_COSMETIC_ADDRESS not set");
  return a as Address;
}

export async function listTypes() {
  const addr = shopAddress();
  const next = await publicClient.readContract({
    address: addr,
    abi: COSMETIC_ABI,
    functionName: "nextTypeId",
  }) as bigint;

  const out: Array<{
    id: number;
    priceWei: string;
    active: boolean;
    metadataURI: string;
    maxSupply: number;
    minted: number;
  }> = [];

  for (let i = 1n; i < next; i++) {
    const t = await publicClient.readContract({
      address: addr,
      abi: COSMETIC_ABI,
      functionName: "cosmeticTypes",
      args: [i],
    }) as readonly [bigint, boolean, string, bigint, bigint];
    out.push({
      id: Number(i),
      priceWei: t[0].toString(),
      active: t[1],
      metadataURI: t[2],
      maxSupply: Number(t[3]),
      minted: Number(t[4]),
    });
  }
  return out;
}

// Walk Transfer logs to enumerate every tokenId an address currently
// owns. For a low-volume cosmetic shop this is more than fast enough;
// once volume grows, swap to a tokenOfOwnerByIndex extension or an
// off-chain index.
export async function ownedByAddress(owner: Address) {
  const addr = shopAddress();
  const balance = await publicClient.readContract({
    address: addr,
    abi: COSMETIC_ABI,
    functionName: "balanceOf",
    args: [owner],
  }) as bigint;

  if (balance === 0n) return [] as Array<{ tokenId: number; typeId: number }>;

  const inLogs = await publicClient.getLogs({
    address: addr,
    event: COSMETIC_ABI[3],
    args: { to: owner },
    fromBlock: 0n,
  });
  const outLogs = await publicClient.getLogs({
    address: addr,
    event: COSMETIC_ABI[3],
    args: { from: owner },
    fromBlock: 0n,
  });

  const owned = new Set<bigint>();
  // Iterate chronologically: transfers IN add, OUT remove. ERC-721 mint
  // events are also Transfers from address(0).
  type Ev = { blockNumber: bigint; logIndex: number; tokenId: bigint; kind: "in" | "out" };
  const events: Ev[] = [
    ...inLogs.map(l => ({ blockNumber: l.blockNumber!, logIndex: l.logIndex!, tokenId: l.args.tokenId!, kind: "in" as const })),
    ...outLogs.map(l => ({ blockNumber: l.blockNumber!, logIndex: l.logIndex!, tokenId: l.args.tokenId!, kind: "out" as const })),
  ].sort((a, b) => {
    if (a.blockNumber !== b.blockNumber) return Number(a.blockNumber - b.blockNumber);
    return a.logIndex - b.logIndex;
  });
  for (const e of events) {
    if (e.kind === "in") owned.add(e.tokenId);
    else owned.delete(e.tokenId);
  }

  const out: Array<{ tokenId: number; typeId: number }> = [];
  for (const tokenId of owned) {
    const typeId = await publicClient.readContract({
      address: addr,
      abi: COSMETIC_ABI,
      functionName: "tokenIdToType",
      args: [tokenId],
    }) as bigint;
    out.push({ tokenId: Number(tokenId), typeId: Number(typeId) });
  }
  return out;
}
