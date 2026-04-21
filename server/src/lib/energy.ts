import { prisma } from "./prisma.js";

// Energy curve. Tuned so a fresh player can do a meaningful session
// (~100 actions) but a steady regenerator can play indefinitely at a
// slower pace.
//
//   MAX_ENERGY        = 100
//   REGEN_PER_MIN     = 2  → full refill in 50 min idle
//   COST_PER_EVENT    = 1
//   REFILL_AMOUNT     = MAX_ENERGY (one refill = topped up)
//
// Players can also pay RELM to refill instantly; that lever lives in
// the on-chain RelmEnergyRefill contract + watcher.

export const MAX_ENERGY    = 100;
export const REGEN_PER_MIN = 2;
export const COST_PER_EVENT = 1;
export const REFILL_AMOUNT = MAX_ENERGY;

/**
 * Apply elapsed-minutes regen to the row in-memory and return the
 * updated values. Caller is responsible for persisting if they care
 * about the new lastRegenAt.
 */
export function regenInPlace(row: { current: number; lastRegenAt: Date }, now = new Date()) {
  if (row.current >= MAX_ENERGY) {
    return { current: row.current, lastRegenAt: now, regenAdded: 0 };
  }
  const elapsedMs = now.getTime() - row.lastRegenAt.getTime();
  const elapsedMin = Math.floor(elapsedMs / 60_000);
  if (elapsedMin <= 0) return { current: row.current, lastRegenAt: row.lastRegenAt, regenAdded: 0 };
  const add = Math.min(MAX_ENERGY - row.current, elapsedMin * REGEN_PER_MIN);
  // Roll lastRegenAt forward only by the minutes we actually spent so
  // sub-minute fractions accumulate for the next call.
  const consumedMin = Math.ceil(add / REGEN_PER_MIN);
  const nextLast = new Date(row.lastRegenAt.getTime() + consumedMin * 60_000);
  return { current: row.current + add, lastRegenAt: nextLast, regenAdded: add };
}

export async function getOrCreate(player: string) {
  return prisma.playerEnergy.upsert({
    where: { player },
    update: {},
    create: { player, current: MAX_ENERGY, lastRegenAt: new Date() },
  });
}

/**
 * Atomically: regen any pending energy, then debit `cost`. Returns
 * the resulting row. Returns null if the player can't afford the cost
 * (i.e. current < cost) — caller skips the reward in that case.
 */
export async function spend(player: string, cost: number) {
  const row = await getOrCreate(player);
  const regen = regenInPlace(row);
  const after = regen.current - cost;
  if (after < 0) {
    if (regen.regenAdded > 0) {
      await prisma.playerEnergy.update({
        where: { player },
        data: { current: regen.current, lastRegenAt: regen.lastRegenAt },
      });
    }
    return null;
  }
  return prisma.playerEnergy.update({
    where: { player },
    data: { current: after, lastRegenAt: regen.lastRegenAt },
  });
}

export async function credit(player: string, amount: number) {
  const row = await getOrCreate(player);
  const regen = regenInPlace(row);
  const next = Math.min(MAX_ENERGY, regen.current + amount);
  return prisma.playerEnergy.update({
    where: { player },
    data: { current: next, lastRegenAt: regen.lastRegenAt },
  });
}

export async function read(player: string) {
  const row = await getOrCreate(player);
  const regen = regenInPlace(row);
  if (regen.regenAdded > 0) {
    return prisma.playerEnergy.update({
      where: { player },
      data: { current: regen.current, lastRegenAt: regen.lastRegenAt },
    });
  }
  return row;
}
