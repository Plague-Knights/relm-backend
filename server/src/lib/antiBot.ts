import { prisma } from "./prisma.js";

// Anti-bot signals layered on top of scoring. None of these block
// gameplay — they just zero (or near-zero) the *reward* for events
// that look mechanical.
//
// Stack today:
//   1. Wallet-age gate: linked < N days ago → no rewards yet.
//   2. Tight-cadence collapse: dig events with too-tight spacing get
//      a 0.1× multiplier (humans aren't metronomes).
//   3. Variance check: dig timings with near-zero variance over the
//      last 20 events → multiplier 0.0.
//
// Tunable via env so we can tighten or loosen without redeploying.

const DEFAULT_MIN_LINK_DAYS = 7;
const DEFAULT_MIN_AVG_GAP_MS = 1500;     // < 1.5s avg = bot-tight
const DEFAULT_MIN_VARIANCE = 50_000;     // (ms²) — humans easily exceed this
const PATTERN_WINDOW = 20;
const MS_PER_DAY = 86_400_000;

function intEnv(key: string, fallback: number): number {
  const v = process.env[key];
  if (!v) return fallback;
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

/**
 * Wallet-age gate: returns false if the player's PlayerWallet is too
 * fresh to be earning yet. Keep DB-cheap by reading linkedAt only.
 */
export async function walletEligibleForReward(player: string): Promise<boolean> {
  const minDays = intEnv("ANTIBOT_MIN_LINK_DAYS", DEFAULT_MIN_LINK_DAYS);
  if (minDays <= 0) return true;
  const wallet = await prisma.playerWallet.findUnique({ where: { player } });
  if (!wallet) return false; // unlinked → no rewards anyway
  const ageMs = Date.now() - wallet.linkedAt.getTime();
  return ageMs >= minDays * MS_PER_DAY;
}

/**
 * Multiplier in [0, 1] based on the cadence + variance of this player's
 * recent dig events. Returns:
 *   1.0  — looks human enough
 *   0.1  — suspiciously tight cadence
 *   0.0  — near-zero variance over the window (clearly mechanical)
 *
 * Cheap: pulls just the last PATTERN_WINDOW createdAt timestamps for
 * the player, indexed via (address, createdAt) on RewardEvent.
 */
export async function patternMultiplier(player: string): Promise<number> {
  const minAvgGapMs = intEnv("ANTIBOT_MIN_AVG_GAP_MS", DEFAULT_MIN_AVG_GAP_MS);
  const minVariance = intEnv("ANTIBOT_MIN_VARIANCE", DEFAULT_MIN_VARIANCE);
  if (minAvgGapMs <= 0 && minVariance <= 0) return 1;

  const recent = await prisma.rewardEvent.findMany({
    where: { player, kind: "dignode" },
    orderBy: { createdAt: "desc" },
    take: PATTERN_WINDOW,
    select: { createdAt: true },
  });
  if (recent.length < PATTERN_WINDOW) return 1; // not enough data

  // Compute inter-event gaps in ms.
  const gaps: number[] = [];
  for (let i = 0; i < recent.length - 1; i++) {
    const a = recent[i]!.createdAt.getTime();
    const b = recent[i + 1]!.createdAt.getTime();
    gaps.push(Math.abs(a - b));
  }
  if (gaps.length === 0) return 1;

  const avg = gaps.reduce((s, g) => s + g, 0) / gaps.length;
  const variance = gaps.reduce((s, g) => s + (g - avg) ** 2, 0) / gaps.length;

  // Near-zero variance → mechanical; full collapse.
  if (minVariance > 0 && variance < minVariance) return 0;
  // Tight average gap → suspicious; collapse to a tenth.
  if (minAvgGapMs > 0 && avg < minAvgGapMs) return 0.1;
  return 1;
}
