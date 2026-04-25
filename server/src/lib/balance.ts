import { prisma } from "./prisma.js";

// Internal "game wallet" balance, in bps (10,000 bps = 1 RELM).
// First-touch creates a row with the demo starter balance so testers
// have something to wager with before the mint pipeline routes
// through here.

const STARTER_BPS = 100_000; // 10 RELM demo credit

export async function get(player: string): Promise<number> {
  const row = await prisma.playerBalance.findUnique({ where: { player } });
  if (row) return row.balanceBps;
  await prisma.playerBalance.create({
    data: { player, balanceBps: STARTER_BPS },
  });
  return STARTER_BPS;
}

/**
 * Atomically debit the balance. Returns the new balance, or null if the
 * player can't afford it.
 */
export async function debit(player: string, amount: number): Promise<number | null> {
  if (amount <= 0) return null;
  const result = await prisma.playerBalance.updateMany({
    where: { player, balanceBps: { gte: amount } },
    data: { balanceBps: { decrement: amount } },
  });
  if (result.count === 0) {
    // Either the row doesn't exist or insufficient funds — make sure
    // the row exists for the next try then signal failure.
    await get(player);
    return null;
  }
  const row = await prisma.playerBalance.findUnique({ where: { player } });
  return row?.balanceBps ?? null;
}

export async function credit(player: string, amount: number): Promise<number> {
  if (amount <= 0) return get(player);
  await get(player); // ensure row
  const row = await prisma.playerBalance.update({
    where: { player },
    data: { balanceBps: { increment: amount } },
  });
  return row.balanceBps;
}
