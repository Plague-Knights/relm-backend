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
      { name: "priceRelm", type: "uint256" },
      { name: "active", type: "bool" },
      { name: "metadataURI", type: "string" },
      { name: "maxSupply", type: "uint256" },
      { name: "minted", type: "uint256" },
      { name: "itemId", type: "string" },
      { name: "perks", type: "uint16" },
    ],
  },
  {
    type: "function", name: "balanceOf", stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
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

export type CosmeticType = {
  id: number;
  priceWei: string;
  priceRelm: string;
  active: boolean;
  metadataURI: string;
  maxSupply: number;
  minted: number;
  itemId: string;
  perks: number;
};

export async function listTypes(): Promise<CosmeticType[]> {
  const addr = shopAddress();
  const next = await publicClient.readContract({
    address: addr,
    abi: COSMETIC_ABI,
    functionName: "nextTypeId",
  }) as bigint;

  const out: CosmeticType[] = [];
  for (let i = 1n; i < next; i++) {
    const t = await publicClient.readContract({
      address: addr,
      abi: COSMETIC_ABI,
      functionName: "cosmeticTypes",
      args: [i],
    }) as readonly [bigint, bigint, boolean, string, bigint, bigint, string, number];
    out.push({
      id: Number(i),
      priceWei: t[0].toString(),
      priceRelm: t[1].toString(),
      active: t[2],
      metadataURI: t[3],
      maxSupply: Number(t[4]),
      minted: Number(t[5]),
      itemId: t[6],
      perks: Number(t[7]),
    });
  }
  return out;
}

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

// Bitmask helpers — mirror the Lua side and the Solidity constants.
export const PERKS = {
  UNBREAKABLE:   1 << 0,
  KEEP_ON_DEATH: 1 << 1,
  SOULBOUND:     1 << 2,
  AUTO_PICKUP:   1 << 3,
} as const;

export function perksToList(perks: number): string[] {
  const out: string[] = [];
  if (perks & PERKS.UNBREAKABLE)   out.push("unbreakable");
  if (perks & PERKS.KEEP_ON_DEATH) out.push("keep_on_death");
  if (perks & PERKS.SOULBOUND)     out.push("soulbound");
  if (perks & PERKS.AUTO_PICKUP)   out.push("auto_pickup");
  return out;
}
