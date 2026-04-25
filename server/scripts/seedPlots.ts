// Seed available plots on the world map. Tiers occupy non-overlapping
// rings around spawn:
//
//   inner ring   (0 → 1024 from spawn)    ← Tier 1 plots, dense
//   middle ring  (1024 → 3072 from spawn) ← Tier 2 regions
//   outer ring   (3072 → 6144 from spawn) ← Tier 3 territories, sparse
//
// Non-overlap keeps the ACL deterministic — `ownerAt(x, z)` returns
// exactly one plot.
//
// Usage:  pnpm tsx scripts/seedPlots.ts
//
// Idempotent — uses the (x, z, tier) unique constraint so re-running
// just fills in any missing rows.

import { prisma } from "../src/lib/prisma.js";
import { LAND_TIERS, type TierId } from "../src/lib/landTiers.js";

interface RingDef {
  tier: TierId;
  inner: number;  // distance from spawn
  outer: number;
  step: number;   // grid spacing for this ring (matches tier size)
}

const RINGS: RingDef[] = [
  { tier: 1, inner: 0,    outer: 1024, step: 32  },
  { tier: 2, inner: 1024, outer: 3072, step: 128 },
  { tier: 3, inner: 3072, outer: 6144, step: 512 },
];

function inRing(x: number, z: number, inner: number, outer: number): boolean {
  const cx = x + 0; // could include plot center if we wanted, corner is fine
  const cz = z + 0;
  const dist = Math.max(Math.abs(cx), Math.abs(cz));
  return dist >= inner && dist < outer;
}

async function seedRing(ring: RingDef): Promise<number> {
  const def = LAND_TIERS[ring.tier];
  let created = 0;
  for (let x = -ring.outer; x < ring.outer; x += ring.step) {
    for (let z = -ring.outer; z < ring.outer; z += ring.step) {
      // Skip plots that aren't entirely within the ring band.
      if (!inRing(x, z, ring.inner, ring.outer)) continue;
      try {
        await prisma.landPlot.create({
          data: {
            x,
            z,
            tier: def.id,
            size: def.size,
            status: "available",
          },
        });
        created++;
      } catch {
        // unique conflict — already seeded, skip silently
      }
    }
  }
  return created;
}

async function main() {
  console.log("Seeding plots into spawn-centered rings…");
  for (const ring of RINGS) {
    const n = await seedRing(ring);
    const def = LAND_TIERS[ring.tier];
    console.log(`  Tier ${ring.tier} (${def.name}, ${def.size}×${def.size}): seeded ${n} plot(s) in ring ${ring.inner}-${ring.outer}`);
  }
  const total = await prisma.landPlot.count({ where: { status: "available" } });
  console.log(`Done. ${total} plot(s) available worldwide.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
