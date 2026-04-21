import { Router, type Request, type Response } from "express";
import { listTypes, ownedByAddress, perksToList } from "../lib/cosmetic.js";
import type { Address } from "viem";

export const cosmeticsRouter = Router();

const COSMETIC_META: Record<number, { name: string; description: string; image: string; attributes: Array<{ trait_type: string; value: string }> }> = {
  1: {
    name: "Crimson Cape",
    description: "A flowing crimson cape — pure cosmetic accessory.",
    image: "https://relm-link-production.up.railway.app/shop/img/cape-crimson.svg",
    attributes: [
      { trait_type: "Slot", value: "Cape" },
      { trait_type: "Rarity", value: "Common" },
    ],
  },
  2: {
    name: "Cobalt Particle Trail",
    description: "Leaves a soft blue particle trail behind your steps.",
    image: "https://relm-link-production.up.railway.app/shop/img/trail-cobalt.svg",
    attributes: [
      { trait_type: "Slot", value: "Trail" },
      { trait_type: "Rarity", value: "Uncommon" },
    ],
  },
  3: {
    name: "Founder Pickaxe",
    description: "Reskins your wood pickaxe in gold. Unbreakable, kept on death, soulbound to you. Limited to the first 100 supporters.",
    image: "https://relm-link-production.up.railway.app/shop/img/pick-founder.svg",
    attributes: [
      { trait_type: "Slot", value: "Pickaxe Skin" },
      { trait_type: "Skins Item", value: "relm_core:pick_wood" },
      { trait_type: "Rarity", value: "Founder" },
      { trait_type: "Unbreakable", value: "Yes" },
      { trait_type: "Keep on Death", value: "Yes" },
      { trait_type: "Soulbound", value: "Yes" },
    ],
  },
  4: {
    name: "Iron Pickaxe Skin",
    description: "Reskins the iron pickaxe with a darker finish. Kept on death.",
    image: "https://relm-link-production.up.railway.app/shop/img/pick-iron.svg",
    attributes: [
      { trait_type: "Slot", value: "Pickaxe Skin" },
      { trait_type: "Skins Item", value: "relm_core:pick_iron" },
      { trait_type: "Rarity", value: "Earned" },
      { trait_type: "Keep on Death", value: "Yes" },
    ],
  },
  5: {
    name: "Wood Axe Skin",
    description: "Cosmetic reskin for the wooden axe — entry-tier RELM purchase.",
    image: "https://relm-link-production.up.railway.app/shop/img/axe-wood.svg",
    attributes: [
      { trait_type: "Slot", value: "Axe Skin" },
      { trait_type: "Skins Item", value: "relm_core:axe_wood" },
      { trait_type: "Rarity", value: "Entry" },
    ],
  },
};

cosmeticsRouter.get("/list", async (_req: Request, res: Response) => {
  try {
    const types = await listTypes();
    const enriched = types.map(t => ({
      ...t,
      perksList: perksToList(t.perks),
      meta: COSMETIC_META[t.id] ?? null,
    }));
    res.json({ types: enriched });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

cosmeticsRouter.get("/owned/:address", async (req: Request, res: Response) => {
  const raw = req.params.address;
  const address = typeof raw === "string" ? raw : "";
  if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
    return res.status(400).json({ error: "bad address" });
  }
  try {
    const owned = await ownedByAddress(address as Address);
    // Enrich with type info for the in-game mod (so it knows perks/itemId)
    const types = await listTypes();
    const byId = new Map(types.map(t => [t.id, t]));
    const enriched = owned.map(o => {
      const t = byId.get(o.typeId);
      return {
        ...o,
        itemId: t?.itemId ?? "",
        perks: t?.perks ?? 0,
        perksList: t ? perksToList(t.perks) : [],
      };
    });
    res.json({ address, owned: enriched });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

cosmeticsRouter.get("/meta/:typeId", (req: Request, res: Response) => {
  const id = Number(req.params.typeId);
  const meta = COSMETIC_META[id];
  if (!meta) return res.status(404).json({ error: "unknown type" });
  res.json(meta);
});
