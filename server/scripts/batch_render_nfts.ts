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
import { makeAvatar, makeIsoRender, type FighterArtInput } from "../src/lib/fighterArt.js";
import { buildMetadata, rollTraits } from "../src/lib/fighterTraits.js";

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
  fs.mkdirSync(path.join(OUT_DIR, "img"), { recursive: true });
  fs.mkdirSync(path.join(OUT_DIR, "iso"), { recursive: true });
  fs.mkdirSync(path.join(OUT_DIR, "meta"), { recursive: true });

  const manifest: Array<{ tokenId: number; id: string; name: string; image: string; metadata: string }> = [];
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

    // Render avatar (square card) + iso render (3D pose).
    const artInput: FighterArtInput = {
      id, name, power, speed, luck,
      power_color: power, speed_color: speed, luck_color: luck,
    } as FighterArtInput;
    const avatar = makeAvatar(artInput);
    const iso = makeIsoRender(artInput);

    const imgRel = `img/${tokenId.toString().padStart(4, "0")}.png`;
    const isoRel = `iso/${tokenId.toString().padStart(4, "0")}.png`;
    const metaRel = `meta/${tokenId.toString().padStart(4, "0")}.json`;

    fs.writeFileSync(path.join(OUT_DIR, imgRel), avatar);
    fs.writeFileSync(path.join(OUT_DIR, isoRel), iso);

    const meta = buildMetadata({
      fighter: { id, name, power, speed, luck, mint: null },
      imageUrl: `${IMAGE_BASE}/${imgRel}`,
      externalUrl: `${EXTERNAL_BASE}/${id}`,
    });
    fs.writeFileSync(path.join(OUT_DIR, metaRel), JSON.stringify(meta, null, 2));

    manifest.push({
      tokenId,
      id,
      name,
      image: `${IMAGE_BASE}/${imgRel}`,
      metadata: `${IMAGE_BASE}/${metaRel}`,
    });

    if ((i + 1) % 50 === 0) {
      const elapsed = (Date.now() - t0) / 1000;
      const rate = (i + 1) / elapsed;
      const eta = (COUNT - i - 1) / rate;
      console.log(`[render] ${i + 1}/${COUNT}  ${rate.toFixed(1)}/s  eta ${eta.toFixed(0)}s`);
    }
  }

  fs.writeFileSync(path.join(OUT_DIR, "manifest.json"),
    JSON.stringify({ count: COUNT, generatedAt: new Date().toISOString(), fighters: manifest }, null, 2));

  const elapsed = (Date.now() - t0) / 1000;
  console.log(`[render] done: ${COUNT} fighters in ${elapsed.toFixed(1)}s -> ${OUT_DIR}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
