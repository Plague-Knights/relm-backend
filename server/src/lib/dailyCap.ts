import { prisma } from "./prisma.js";

// Daily-cap economy. Replaces the per-player energy meter with a
// simpler protocol-style ceiling: each player earns up to N bps per
// UTC day, after which scoring returns 0 until the day rolls over.
//
// Why this instead of energy:
//   - Bots can't game it by waiting (energy regenerates; the cap doesn't move
//     until midnight UTC).
//   - Real players don't get blocked mid-session by an empty meter — they
//     just see their day's earnings flatten out as they approach the cap.
//   - The economy gets a hard supply ceiling (PER_PLAYER * active players),
//     which gives whales nothing extra and protects token value.
//
// Two layers of supply control:
//   1. RELM_DAILY_CAP_BPS  — the *initial* per-player daily cap (bps).
//      Defaults to 30,000 bps = 3 RELM / player / day.
//   2. EMISSION_HALVING_DAYS + EMISSION_GENESIS — every N days the
//      cap halves. After MAX_HALVINGS halvings the cap floors at
//      MIN_DAILY_CAP_BPS so rewards don't asymptote to literal zero.
//
// Together these give predictable scarcity without redeploys: tomorrow
// is the same as today, but a year out is provably lower. Players see
// the curve up front; insiders can't quietly accelerate it.

const DEFAULT_PER_PLAYER_DAILY_CAP_BPS = 30_000;
const MIN_DAILY_CAP_BPS = 1_000;          // floor at 0.1 RELM/day/player
const DEFAULT_HALVING_DAYS = 180;
const MAX_HALVINGS = 4;
const MS_PER_DAY = 86_400_000;

function basePerPlayerCap(): number {
  const raw = process.env.RELM_DAILY_CAP_BPS;
  if (!raw) return DEFAULT_PER_PLAYER_DAILY_CAP_BPS;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_PER_PLAYER_DAILY_CAP_BPS;
}

function halvingDays(): number {
  const raw = process.env.EMISSION_HALVING_DAYS;
  if (!raw) return DEFAULT_HALVING_DAYS;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_HALVING_DAYS;
}

function genesisTs(): number {
  const raw = process.env.EMISSION_GENESIS;
  if (!raw) {
    // Pin to a fixed date so the halving schedule is stable across
    // restarts and reproducible from outside. April 24 2026 UTC.
    return Date.UTC(2026, 3, 24);
  }
  const t = Date.parse(raw);
  return Number.isFinite(t) ? t : Date.UTC(2026, 3, 24);
}

function currentHalvings(now = Date.now()): number {
  const elapsedDays = Math.max(0, (now - genesisTs()) / MS_PER_DAY);
  const halvings = Math.floor(elapsedDays / halvingDays());
  return Math.min(halvings, MAX_HALVINGS);
}

/**
 * Effective per-player daily cap right now, in bps. Halves every
 * EMISSION_HALVING_DAYS, floors at MIN_DAILY_CAP_BPS.
 */
function perPlayerCap(now = Date.now()): number {
  const base = basePerPlayerCap();
  const halvings = currentHalvings(now);
  const decayed = Math.floor(base / 2 ** halvings);
  return Math.max(MIN_DAILY_CAP_BPS, decayed);
}

function utcDay(now = new Date()): string {
  // YYYY-MM-DD in UTC
  return now.toISOString().slice(0, 10);
}

/**
 * Clamp the requested score to whatever the player has remaining for
 * today. Updates their daily counter atomically. Returns the bps the
 * caller should actually award.
 */
export async function clampToDaily(player: string, requestedBps: number): Promise<number> {
  if (requestedBps <= 0) return 0;
  const cap = perPlayerCap();
  const day = utcDay();

  // Upsert the daily row. Concurrent calls for the same player race here,
  // but since each scoreOnce() call processes one event at a time and
  // the scorer doesn't run two at once (per the `running` lock), the race
  // is effectively single-writer per player.
  const row = await prisma.playerDaily.upsert({
    where: { player_day: { player, day } },
    create: { player, day, bpsEarned: 0 },
    update: {},
  });

  if (row.bpsEarned >= cap) return 0;
  const remaining = cap - row.bpsEarned;
  const grant = Math.min(requestedBps, remaining);
  if (grant <= 0) return 0;

  await prisma.playerDaily.update({
    where: { player_day: { player, day } },
    data: { bpsEarned: row.bpsEarned + grant },
  });
  return grant;
}

/**
 * Read-only lookup for the energy/cap endpoint and chat command.
 * Returns today's earned amount + the cap + halving metadata.
 */
export async function readDaily(player: string) {
  const day = utcDay();
  const row = await prisma.playerDaily.findUnique({
    where: { player_day: { player, day } },
  });
  const now = Date.now();
  const halvings = currentHalvings(now);
  const nextHalvingAt = halvings >= MAX_HALVINGS
    ? null
    : new Date(genesisTs() + (halvings + 1) * halvingDays() * MS_PER_DAY).toISOString();
  return {
    player,
    day,
    earnedBps: row?.bpsEarned ?? 0,
    capBps: perPlayerCap(now),
    halvings,
    maxHalvings: MAX_HALVINGS,
    nextHalvingAt,
  };
}
