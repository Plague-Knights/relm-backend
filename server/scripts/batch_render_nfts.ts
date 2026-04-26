// Render N unique fighter NFTs — image PNG + metadata JSON each.
//
//   tsx scripts/batch_render_nfts.ts [count] [outDir]
//
// Defaults: 1000 NFTs into ./sample-fighters/nft/.
//
// Each fighter has deterministic traits derived from its id (cuid),
// so re-running is idempotent for any given id list. The id list is
// generated once and persisted alongside the manifest so every NFT
// always renders the same image.

import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";
import {
  makeAvatar, makeIsoRender, makeInGamePreview, makeInGame3Q, makeSkin,
  type FighterArtInput,
} from "../src/lib/fighterArt.js";
import {
  buildMetadata, rollTraits, traitProbability, type TraitCategory, type TraitSet,
} from "../src/lib/fighterTraits.js";

// Combined inverse-probability of all 5 traits + (power+speed+luck)
// percentile. Tier thresholds get computed in pass 2 from the score
// distribution so we always hit the target 60/25/10/4/1 split.
function rarityScore(traits: TraitSet, total: number): number {
  let traitScore = 0;
  const cats: TraitCategory[] = ["background", "helmet", "armor", "weapon", "hair"];
  for (const c of cats) {
    const p = traitProbability(c, traits[c]);
    if (p > 0) traitScore += 1 / p;
  }
  return traitScore + (total / 285) * 8;
}

// Sorted percentile cutoffs for 1000 fighters: bottom 60% = Common,
// next 25% = Uncommon, next 10% = Rare, next 4% = Epic, top 1% = Leg.
function tierFor(score: number, sorted: number[]): string {
  const n = sorted.length;
  const cuts = [
    { tier: "Common",    upTo: Math.floor(n * 0.60) },
    { tier: "Uncommon",  upTo: Math.floor(n * 0.85) },
    { tier: "Rare",      upTo: Math.floor(n * 0.95) },
    { tier: "Epic",      upTo: Math.floor(n * 0.99) },
    { tier: "Legendary", upTo: n },
  ];
  // Binary search for rank (count of scores ≤ this score).
  let lo = 0, hi = n;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (sorted[mid]! <= score) lo = mid + 1;
    else hi = mid;
  }
  const rank = lo;
  for (const c of cuts) if (rank <= c.upTo) return c.tier;
  return "Legendary";
}

const COUNT = Number(process.argv[2] ?? 1000);
const OUT_DIR = path.resolve(process.argv[3] ?? "./sample-fighters/nft");
const IMAGE_BASE = process.env.NFT_IMAGE_BASE
  ?? "https://relm-link-production.up.railway.app/nft";
const EXTERNAL_BASE = process.env.NFT_EXTERNAL_BASE
  ?? "https://relm-link-production.up.railway.app/fighters";

interface FighterRow {
  id: string;
  name: string;
  power: number;
  speed: number;
  luck: number;
}

function fakeCuid(seed: number): string {
  // Deterministic, lowercase, cuid-ish — long enough that rollTraits
  // gets a wide hash distribution. Real fighters use prisma cuid().
  const h = crypto.createHash("sha256").update(`relm-fighter-${seed}`).digest("hex");
  return "c" + h.slice(0, 24);
}

function nameFor(seed: number, traits: ReturnType<typeof rollTraits>): string {
  // Names: <Adjective><Noun> with the trait pulling some flavor.
  const ADJ = ["Iron", "Cinder", "Hollow", "Bog", "Storm", "Vex", "Pale", "Ash",
               "Ravel", "Sable", "Glint", "Quell", "Mire", "Brisk", "Clinch", "Drift"];
  const NOUN = ["born", "fang", "vein", "step", "hand", "claw", "shade", "pact",
                "rage", "weave", "scale", "tide", "spike", "frost", "burn", "lock"];
  const a = ADJ[seed % ADJ.length];
  const n = NOUN[(seed * 7 + traits.weapon.length) % NOUN.length];
  return `${a}${n}`;
}

function statRoll(seed: number, salt: string): number {
  const h = crypto.createHash("sha256").update(`${seed}:${salt}`).digest();
  return 25 + (h[0]! % 71);   // 25..95 inclusive
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  for (const sub of ["img", "iso", "ingame", "tq", "skin", "meta"]) {
    fs.mkdirSync(path.join(OUT_DIR, sub), { recursive: true });
  }

  // Pass 1: compute all rarity scores so we can pick percentile cutoffs.
  const allScores: number[] = [];
  for (let i = 0; i < COUNT; i++) {
    const id = fakeCuid(i + 1);
    const traits = rollTraits(id);
    const power = statRoll(i + 1, "power");
    const speed = statRoll(i + 1, "speed");
    const luck = statRoll(i + 1, "luck");
    allScores.push(rarityScore(traits, power + speed + luck));
  }
  const sortedScores = [...allScores].sort((a, b) => a - b);

  const manifest: Array<{
    tokenId: number; id: string; name: string;
    image: string; ingame: string; iso: string; threeQuarter: string; skin: string;
    metadata: string; tier: string;
  }> = [];
  const rarityCount: Record<string, number> = {};
  const t0 = Date.now();
  for (let i = 0; i < COUNT; i++) {
    const tokenId = i + 1;
    const id = fakeCuid(tokenId);
    const traits = rollTraits(id);
    const name = nameFor(tokenId, traits);
    const power = statRoll(tokenId, "power");
    const speed = statRoll(tokenId, "speed");
    const luck = statRoll(tokenId, "luck");

    const fighter: FighterRow = { id, name, power, speed, luck };

    // 5 render angles per fighter: avatar (square card), iso (3D
    // perspective), ingame (gameplay screenshot composition),
    // 3-quarter pose, and the skin atlas (used directly by Luanti to
    // texture the in-game character mesh).
    const artInput: FighterArtInput = {
      id, name, power, speed, luck,
      power_color: power, speed_color: speed, luck_color: luck,
    } as FighterArtInput;
    const avatar = makeAvatar(artInput);
    const iso = makeIsoRender(artInput);
    const ingame = makeInGamePreview(artInput);
    const threeQ = makeInGame3Q(artInput);
    const skin = makeSkin(artInput);

    const tag = tokenId.toString().padStart(4, "0");
    const imgRel    = `img/${tag}.png`;
    const isoRel    = `iso/${tag}.png`;
    const ingameRel = `ingame/${tag}.png`;
    const tqRel     = `tq/${tag}.png`;
    const skinRel   = `skin/${tag}.png`;
    const metaRel   = `meta/${tag}.json`;

    fs.writeFileSync(path.join(OUT_DIR, imgRel), avatar);
    fs.writeFileSync(path.join(OUT_DIR, isoRel), iso);
    fs.writeFileSync(path.join(OUT_DIR, ingameRel), ingame);
    fs.writeFileSync(path.join(OUT_DIR, tqRel), threeQ);
    fs.writeFileSync(path.join(OUT_DIR, skinRel), skin);

    const score = rarityScore(traits, power + speed + luck);
    const tier = tierFor(score, sortedScores);
    rarityCount[tier] = (rarityCount[tier] || 0) + 1;

    // The 3-quarter render is the closest match to how the fighter
    // looks in-game (chunky 3D voxel character mesh, perspective view).
    // Use that as the primary NFT image so collectors see what they'll
    // actually wear, not a flat trading-card.
    const baseMeta = buildMetadata({
      fighter: { id, name, power, speed, luck, mint: null },
      imageUrl: `${IMAGE_BASE}/${tqRel}`,
      externalUrl: `${EXTERNAL_BASE}/${id}`,
    });
    const enriched = {
      ...baseMeta,
      attributes: [
        ...(baseMeta.attributes ?? []),
        { trait_type: "Rarity", value: tier },
      ],
      properties: {
        files: [
          { uri: `${IMAGE_BASE}/${imgRel}`,    type: "image/png", role: "avatar" },
          { uri: `${IMAGE_BASE}/${isoRel}`,    type: "image/png", role: "iso" },
          { uri: `${IMAGE_BASE}/${ingameRel}`, type: "image/png", role: "ingame" },
          { uri: `${IMAGE_BASE}/${tqRel}`,     type: "image/png", role: "three_quarter" },
          { uri: `${IMAGE_BASE}/${skinRel}`,   type: "image/png", role: "luanti_skin" },
        ],
        category: "image",
      },
    };
    fs.writeFileSync(path.join(OUT_DIR, metaRel), JSON.stringify(enriched, null, 2));

    manifest.push({
      tokenId, id, name,
      image:        `${IMAGE_BASE}/${tqRel}`,    // primary in-game pose
      iso:          `${IMAGE_BASE}/${isoRel}`,
      ingame:       `${IMAGE_BASE}/${ingameRel}`,
      threeQuarter: `${IMAGE_BASE}/${tqRel}`,
      avatar:       `${IMAGE_BASE}/${imgRel}`,   // square card
      skin:         `${IMAGE_BASE}/${skinRel}`,  // luanti character.png atlas
      metadata:     `${IMAGE_BASE}/${metaRel}`,
      tier,
    });

    if ((i + 1) % 50 === 0) {
      const elapsed = (Date.now() - t0) / 1000;
      const rate = (i + 1) / elapsed;
      const eta = (COUNT - i - 1) / rate;
      console.log(`[render] ${i + 1}/${COUNT}  ${rate.toFixed(1)}/s  eta ${eta.toFixed(0)}s`);
    }
  }

  fs.writeFileSync(path.join(OUT_DIR, "manifest.json"),
    JSON.stringify({
      count: COUNT,
      generatedAt: new Date().toISOString(),
      rarityDistribution: rarityCount,
      fighters: manifest,
    }, null, 2));

  const elapsed = (Date.now() - t0) / 1000;
  console.log(`[render] done: ${COUNT} fighters in ${elapsed.toFixed(1)}s -> ${OUT_DIR}`);
  console.log(`[render] rarity:`, rarityCount);
}

main().catch((e) => { console.error(e); process.exit(1); });
