import { Router, type Request, type Response } from "express";
import { listTypes, ownedByAddress } from "../lib/cosmetic.js";
import type { Address } from "viem";

export const cosmeticsRouter = Router();

// In-memory metadata for our 3 starter types. Lifting these to IPFS or
// a CMS comes when we're seeding more than a handful of items.
const COSMETIC_META: Record<number, { name: string; description: string; image: string; attributes: Array<{ trait_type: string; value: string }> }> = {
  1: {
    name: "Crimson Cape",
    description: "A flowing crimson cape — first cosmetic in the Relm shop.",
    image: "https://relm-link-production.up.railway.app/shop/img/cape-crimson.svg",
    attributes: [{ trait_type: "Slot", value: "Cape" }, { trait_type: "Rarity", value: "Common" }],
  },
  2: {
    name: "Cobalt Particle Trail",
    description: "Leaves a soft blue particle trail behind your steps.",
    image: "https://relm-link-production.up.railway.app/shop/img/trail-cobalt.svg",
    attributes: [{ trait_type: "Slot", value: "Trail" }, { trait_type: "Rarity", value: "Uncommon" }],
  },
  3: {
    name: "Founder Pickaxe Skin",
    description: "Limited to the first 100. Marks an early Relm supporter.",
    image: "https://relm-link-production.up.railway.app/shop/img/pick-founder.svg",
    attributes: [{ trait_type: "Slot", value: "Pickaxe Skin" }, { trait_type: "Rarity", value: "Founder" }],
  },
};

// GET /api/cosmetics/list → on-chain types + UI metadata merged.
cosmeticsRouter.get("/list", async (_req: Request, res: Response) => {
  try {
    const types = await listTypes();
    const enriched = types.map(t => ({
      ...t,
      meta: COSMETIC_META[t.id] ?? null,
    }));
    res.json({ types: enriched });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

// GET /api/cosmetics/owned/:address → list this address's NFTs.
// Lua mod uses this when a player joins to apply equipped cosmetics.
cosmeticsRouter.get("/owned/:address", async (req: Request, res: Response) => {
  const raw = req.params.address;
  const address = typeof raw === "string" ? raw : "";
  if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
    return res.status(400).json({ error: "bad address" });
  }
  try {
    const owned = await ownedByAddress(address as Address);
    res.json({ address, owned });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

// GET /api/cosmetics/meta/:typeId → ERC-721 metadata for a type.
// The on-chain tokenURI points here so wallets/explorers can resolve.
cosmeticsRouter.get("/meta/:typeId", (req: Request, res: Response) => {
  const id = Number(req.params.typeId);
  const meta = COSMETIC_META[id];
  if (!meta) return res.status(404).json({ error: "unknown type" });
  res.json(meta);
});
