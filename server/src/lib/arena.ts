import * as crypto from "node:crypto";

// Arena simulation — fully deterministic from (fighters, seed). The
// server commits H(seed) when the round opens, reveals the seed when
// the betting window closes; anyone can re-derive the outcome offline
// to verify nothing was rigged.
//
// Pari-mutuel betting: house takes 5% off the top, winners split the
// remaining 95% pro-rata to their stake on the winning fighter. Two
// percentage-points of the house cut burns RELM (handled at settlement
// by debiting the system-wide pool, no contract burn yet).

export interface FighterStat {
  id: string;
  name: string;
  power: number; // 1..100
  speed: number; // 1..100
  luck: number;  // 1..100
}

const NPC_NAMES = [
  "Stoneborn", "Rustfang", "Pale Wolf", "Inkclaw", "Dredger",
  "Boglight", "Ironvein", "Cinderhand", "Mossreaper", "Glasswind",
  "Thornsworn", "Brokesteel", "Hollowmask", "Coldforge", "Briarjaw",
  "Sootmaw", "Hornsplit", "Drylung", "Mireborn", "Gristbone",
];

export function pickFighters(seed: Buffer): FighterStat[] {
  // Use the seed itself to deterministically pick names + roll stats.
  // Stats are uniformly random in [25, 95] so spreads stay interesting
  // — extreme outliers are rare.
  const rng = makeRng(seed);
  const names = pickN(NPC_NAMES, 4, rng);
  return names.map((name, i) => ({
    id: `f${i}`,
    name,
    power: 25 + Math.floor(rng() * 70),
    speed: 25 + Math.floor(rng() * 70),
    luck:  25 + Math.floor(rng() * 70),
  }));
}

/**
 * Deterministic-but-noisy fight outcome. Each fighter's score is a
 * weighted sum of stats plus a luck-scaled random nudge. Highest
 * score wins. Returns the winner index 0..3.
 */
export function runSimulation(fighters: FighterStat[], seed: Buffer): number {
  const rng = makeRng(seed, "sim");
  let best = 0;
  let bestScore = -Infinity;
  for (let i = 0; i < fighters.length; i++) {
    const f = fighters[i]!;
    const base = f.power * 0.55 + f.speed * 0.35 + f.luck * 0.10;
    // ±50 swing scaled by luck so a high-luck underdog has a real
    // shot. RNG range [-1, 1].
    const swing = (rng() * 2 - 1) * (0.25 + f.luck * 0.0025) * 50;
    const score = base + swing;
    if (score > bestScore) {
      bestScore = score;
      best = i;
    }
  }
  return best;
}

export function commitSeed(): { seed: Buffer; commit: string } {
  const seed = crypto.randomBytes(32);
  const commit = crypto.createHash("sha256").update(seed).digest("hex");
  return { seed, commit };
}

export function verifyCommit(commit: string, seedHex: string): boolean {
  try {
    const seed = Buffer.from(seedHex, "hex");
    const computed = crypto.createHash("sha256").update(seed).digest("hex");
    return commit === computed;
  } catch {
    return false;
  }
}

// ───────── helpers ─────────

function makeRng(seed: Buffer, salt = "") {
  // Stretch the seed via SHA-256 chained with a counter so we can
  // produce as many uniform [0,1) values as needed.
  let state = crypto
    .createHash("sha256")
    .update(seed)
    .update(salt)
    .digest();
  let counter = 0;
  return () => {
    state = crypto.createHash("sha256").update(state).update(String(counter++)).digest();
    // Take first 6 bytes → 48 bits → divide by 2^48.
    const n =
      (state[0]! * 2 ** 40) +
      (state[1]! * 2 ** 32) +
      (state[2]! * 2 ** 24) +
      (state[3]! * 2 ** 16) +
      (state[4]! * 2 ** 8) +
      state[5]!;
    return n / 2 ** 48;
  };
}

function pickN<T>(pool: T[], n: number, rng: () => number): T[] {
  const copy = pool.slice();
  const out: T[] = [];
  for (let i = 0; i < n && copy.length > 0; i++) {
    const idx = Math.floor(rng() * copy.length);
    out.push(copy.splice(idx, 1)[0]!);
  }
  return out;
}
