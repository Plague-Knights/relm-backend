// Land tier definitions. Sized + priced for SOL ~$80 (Apr 2026):
//   Tier 1 Plot      — 32×32   ~0.25 SOL  (~$20)
//   Tier 2 Region    — 128×128 ~1.00 SOL  (~$80)
//   Tier 3 Territory — 512×512 ~3.00 SOL  (~$240)
//
// Override any of the SOL prices via env so we can adjust the floor as
// SOL/USD moves without redeploying.

export type TierId = 1 | 2 | 3;

export interface LandTier {
  id: TierId;
  name: string;
  size: number;       // edge length in blocks
  priceSol: string;   // decimal as string for precision
  perks: string[];
}

function envPrice(key: string, fallback: string): string {
  const v = process.env[key];
  if (!v) return fallback;
  if (!/^\d+(\.\d+)?$/.test(v.trim())) return fallback;
  return v.trim();
}

export const LAND_TIERS: Record<TierId, LandTier> = {
  1: {
    id: 1,
    name: "Plot",
    size: 32,
    priceSol: envPrice("LAND_TIER1_SOL", "0.25"),
    perks: [
      "Personal home build / dig protection",
      "Plot owner controls ACL",
    ],
  },
  2: {
    id: 2,
    name: "Region",
    size: 128,
    priceSol: envPrice("LAND_TIER2_SOL", "1.0"),
    perks: [
      "Multiple plots' worth of buildable land",
      "Crafting workshops / shared chests",
      "Owner can invite a guildmate to co-build",
    ],
  },
  3: {
    id: 3,
    name: "Territory",
    size: 512,
    priceSol: envPrice("LAND_TIER3_SOL", "3.0"),
    perks: [
      "Town / clan-scale claim",
      "Custom territory name on the map",
      "Sub-plot leasing (charge other players in RELM to build inside)",
    ],
  },
};

export function tierOf(id: number): LandTier | null {
  if (id === 1 || id === 2 || id === 3) return LAND_TIERS[id];
  return null;
}
