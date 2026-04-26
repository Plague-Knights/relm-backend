import * as crypto from "node:crypto";

// Fighter trait system. Every fighter id rolls a deterministic set of
// traits across 5 categories. Traits feed two things:
//   1. The procedural atlas — helmet/hair/armor get painted in the
//      64×32 skin so they show in-game on the Luanti mesh.
//   2. The portrait + NFT metadata — every trait, including the
//      background and weapon, is included as a Metaplex `attribute`
//      so marketplaces can render rarity tables.
//
// Rarity weights are a soft tier system: lower weight = rarer. Traits
// stay deterministic per id so the same fighter rolls the same set
// every time the renderer runs.

export type TraitCategory = "background" | "helmet" | "armor" | "weapon" | "hair";

export interface Trait {
  name: string;
  weight: number; // higher = more common
}

const TRAITS: Record<TraitCategory, Trait[]> = {
  background: [
    { name: "Arena Stone",    weight: 26 },
    { name: "Green Valley",   weight: 22 },
    { name: "Fire Chasm",     weight: 16 },
    { name: "Nebula Void",    weight: 13 },
    { name: "Frozen Tundra",  weight: 10 },
    { name: "Crystal Cave",   weight: 8 },
    { name: "Stormfront",     weight: 7 },
    { name: "Sunset Mesa",    weight: 6 },
    { name: "Gilded Hall",    weight: 4 },
    { name: "Black Hole",     weight: 2 },   // mythic
  ],
  helmet: [
    { name: "Bare Head",      weight: 24 },
    { name: "Headband",       weight: 18 },
    { name: "Steel Circlet",  weight: 14 },
    { name: "Visor",          weight: 11 },
    { name: "Hooded Cowl",    weight: 9 },
    { name: "Horned Crown",   weight: 8 },
    { name: "Skull Mask",     weight: 6 },
    { name: "Full Plate",     weight: 5 },
    { name: "Beast Skull",    weight: 3 },
    { name: "Halo",           weight: 2 },   // mythic
  ],
  armor: [
    { name: "Solid",          weight: 24 },
    { name: "Striped",        weight: 18 },
    { name: "Scaled",         weight: 14 },
    { name: "Chest Emblem",   weight: 12 },
    { name: "Plated",         weight: 10 },
    { name: "Runic",          weight: 8 },
    { name: "Inverted",       weight: 6 },
    { name: "Tribal",         weight: 5 },
    { name: "Mythril Weave",  weight: 2 },
    { name: "Voidsteel",      weight: 1 },   // mythic
  ],
  weapon: [
    { name: "Axe",            weight: 22 },
    { name: "Blade",           weight: 20 },
    { name: "Staff",           weight: 14 },
    { name: "Bow",             weight: 12 },
    { name: "Pickaxe",         weight: 10 },
    { name: "Warhammer",       weight: 8 },
    { name: "Twin Daggers",    weight: 6 },
    { name: "Crossbow",        weight: 5 },
    { name: "Scythe",          weight: 2 },
    { name: "Soulblade",       weight: 1 },   // mythic
  ],
  hair: [
    { name: "Buzz",            weight: 22 },
    { name: "Bald",            weight: 18 },
    { name: "Short",           weight: 18 },
    { name: "Long",            weight: 12 },
    { name: "Mohawk",          weight: 10 },
    { name: "Topknot",         weight: 8 },
    { name: "Flowing",         weight: 6 },
    { name: "Dreadlocks",      weight: 4 },
    { name: "Flame Hair",      weight: 1 },   // mythic
    { name: "Crystal Hair",    weight: 1 },   // mythic
  ],
};

export type TraitSet = { [K in TraitCategory]: string };

/**
 * Roll deterministic traits for a fighter. Each category uses an
 * independent SHA-256 sub-stream so future trait additions don't
 * disturb the existing fighters' assignments.
 */
export function rollTraits(fighterId: string): TraitSet {
  const out: Partial<TraitSet> = {};
  for (const cat of Object.keys(TRAITS) as TraitCategory[]) {
    const seed = crypto
      .createHash("sha256")
      .update(fighterId)
      .update(":")
      .update(cat)
      .digest();
    const r = (seed[0]! << 8) | seed[1]!; // 16-bit roll, plenty of headroom
    out[cat] = pickWeighted(TRAITS[cat], r / 0x10000);
  }
  return out as TraitSet;
}

/** Total weight of every category — used by the metadata builder. */
export function totalWeight(cat: TraitCategory): number {
  return TRAITS[cat].reduce((s, t) => s + t.weight, 0);
}

/** Probability (0..1) of rolling a specific trait — for rarity strings. */
export function traitProbability(cat: TraitCategory, name: string): number {
  const t = TRAITS[cat].find((x) => x.name === name);
  if (!t) return 0;
  return t.weight / totalWeight(cat);
}

function pickWeighted(traits: Trait[], roll01: number): string {
  const total = traits.reduce((s, t) => s + t.weight, 0);
  const target = roll01 * total;
  let acc = 0;
  for (const t of traits) {
    acc += t.weight;
    if (target < acc) return t.name;
  }
  return traits[traits.length - 1]!.name;
}

/**
 * Metaplex-compatible metadata for a fighter. Includes both stat and
 * trait attributes so OpenSea / Magic Eden / Tensor render rarity
 * scores correctly.
 */
export function buildMetadata(args: {
  fighter: { id: string; name: string; power: number; speed: number; luck: number; mint: string | null };
  imageUrl: string;
  externalUrl?: string;
}) {
  const { fighter, imageUrl, externalUrl } = args;
  const traits = rollTraits(fighter.id);
  return {
    name: fighter.name,
    description: `A Relm Arena fighter. Power ${fighter.power}, Speed ${fighter.speed}, Luck ${fighter.luck}.`,
    image: imageUrl,
    external_url: externalUrl,
    attributes: [
      { trait_type: "Background", value: traits.background },
      { trait_type: "Helmet",     value: traits.helmet     },
      { trait_type: "Armor",      value: traits.armor      },
      { trait_type: "Weapon",     value: traits.weapon     },
      { trait_type: "Hair",       value: traits.hair       },
      { trait_type: "Power",      value: fighter.power, max_value: 100 },
      { trait_type: "Speed",      value: fighter.speed, max_value: 100 },
      { trait_type: "Luck",       value: fighter.luck,  max_value: 100 },
    ],
  };
}
