// Thin Solana client wrapper for the land payment watcher. Reads the
// treasury wallet's recent inbound transactions, decodes memos, and
// hands payments back to the matcher.
//
// We only need read-only RPC access — the contract here is "user
// sends SOL to TREASURY_SOL_ADDRESS with a memo we issued, watcher
// sees the tx, marks the plot owned." No signing, no minting on
// Solana — Solana is purely the payment rail.

import { Connection, PublicKey, type ParsedTransactionWithMeta } from "@solana/web3.js";

const SOL_DECIMALS = 9;
const LAMPORTS_PER_SOL = 10n ** BigInt(SOL_DECIMALS);

let conn: Connection | null = null;

function getConn(): Connection {
  if (!conn) {
    const url = process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";
    conn = new Connection(url, "confirmed");
  }
  return conn;
}

export interface ObservedPayment {
  signature: string;
  fromAddr: string;
  amountSol: string; // decimal string, e.g. "0.25"
  memo: string | null;
  blockTime: number | null;
}

/**
 * Pull the most recent inbound transactions to the treasury wallet
 * and return decoded payments. Caller is responsible for storing the
 * highest-seen signature so the next pass only fetches newer txs.
 */
export async function fetchInboundSince(
  treasury: PublicKey,
  sinceSignature: string | undefined,
  limit = 50,
): Promise<ObservedPayment[]> {
  const c = getConn();
  const sigs = await c.getSignaturesForAddress(treasury, {
    until: sinceSignature,
    limit,
  });
  if (sigs.length === 0) return [];

  const parsed = await c.getParsedTransactions(
    sigs.map((s) => s.signature),
    { maxSupportedTransactionVersion: 0 },
  );

  const out: ObservedPayment[] = [];
  for (let i = 0; i < parsed.length; i++) {
    const tx = parsed[i];
    const sigInfo = sigs[i];
    if (!tx || !sigInfo) continue;
    const inbound = decodeInbound(tx, treasury);
    if (!inbound) continue;
    out.push({
      signature: sigInfo.signature,
      blockTime: sigInfo.blockTime ?? null,
      ...inbound,
    });
  }
  return out;
}

// Walk the parsed instructions for a SystemProgram::transfer that
// targets our treasury, and concatenate any memo-program memos.
function decodeInbound(
  tx: ParsedTransactionWithMeta,
  treasury: PublicKey,
): { fromAddr: string; amountSol: string; memo: string | null } | null {
  if (!tx.transaction?.message) return null;
  const instructions = tx.transaction.message.instructions;
  let inboundLamports = 0n;
  let fromAddr: string | null = null;
  const memos: string[] = [];
  const treasuryStr = treasury.toBase58();

  for (const ix of instructions) {
    if ("parsed" in ix && ix.parsed) {
      const p = ix.parsed as { type?: string; info?: { source?: string; destination?: string; lamports?: number | string } };
      if (p.type === "transfer" && p.info?.destination === treasuryStr && p.info.source) {
        const lamports = BigInt(String(p.info.lamports ?? 0));
        inboundLamports += lamports;
        fromAddr = p.info.source;
      }
      if (ix.program === "spl-memo" && typeof p === "object" && "type" in (ix as any)) {
        // `parsed` for memo program is the memo string itself in some
        // RPC responses; in others it's `parsed: "the memo"`.
      }
    }
    // Memo program writes its data as the raw `parsed` (a string) on this RPC.
    if ("program" in ix && ix.program === "spl-memo") {
      const raw = (ix as any).parsed;
      if (typeof raw === "string") memos.push(raw);
    }
  }
  if (inboundLamports === 0n || !fromAddr) return null;
  return {
    fromAddr,
    amountSol: lamportsToSolString(inboundLamports),
    memo: memos.length > 0 ? memos.join(" ") : null,
  };
}

function lamportsToSolString(lamports: bigint): string {
  const whole = lamports / LAMPORTS_PER_SOL;
  const frac = lamports % LAMPORTS_PER_SOL;
  if (frac === 0n) return whole.toString();
  // Pad fractional to 9 digits, trim trailing zeros.
  const fracStr = frac.toString().padStart(SOL_DECIMALS, "0").replace(/0+$/, "");
  return fracStr ? `${whole}.${fracStr}` : whole.toString();
}

export function publicKeyOrNull(addr: string | undefined): PublicKey | null {
  if (!addr) return null;
  try { return new PublicKey(addr); } catch { return null; }
}
