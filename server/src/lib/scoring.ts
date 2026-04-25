// Scoring curve for Relm gameplay events.
//
// Values are in BPS — 10000 bps = 1 RELM token (the mint call converts
// bps × 1e14 into token wei). Keeping the curve in bps gives us 4
// decimal places of granularity without floating point anywhere.
//
// The server is the only thing that knows these numbers, and they
// can change across deploys without touching the mod. Lua just sends
// raw event signals; this file decides what they're worth.

type EventKind = "dignode" | "placenode" | "hp_change" | "death" | string;

// Reward table in bps (10000 bps = 1 RELM). Higher = rarer / harder /
// deeper. The mapgen ore depths + clust_scarcity in mods/relm_core
// pick the frequency; this file sets the payout. Keep the two
// aligned — if we nerf an ore's spawn rate, bump its bps to match.
// New philosophy: trivial actions earn dust, dangerous / rare / deep
// actions earn real tokens. Combined with the daily cap (lib/dailyCap.ts)
// this means a thousand dirt blocks/day still hits the cap fast — no
// one farms surface dirt for hours.
//
// Keep aligned with mods/relm_core mapgen: nerf an ore's spawn rate,
// bump its bps here.
const DIG_BPS: Record<string, number> = {
  // Surface filler — dust-tier so fresh players see *something* tick
  // over while exploring.
  "relm_core:stone":     15,
  "relm_core:dirt":       5,
  "relm_core:grass":      5,
  "relm_core:sand":       5,
  "relm_core:leaves":     2,

  // Renewable wood-cycle: trees are finite per chunk so worth a bit
  // more than dirt, but wood (the crafted form) only earns dust to
  // kill dig→craft→place→re-dig farms.
  "relm_core:tree":       80,
  "relm_core:wood":        5,

  // Real economy — depth + risk + scarcity. Bumped vs the old curve
  // so the daily cap actually fills from these tiers, not from dirt.
  "relm_core:coal_ore":   250,  // 0.025 RELM
  "relm_core:iron_ore":   700,  // 0.07 RELM
  "relm_core:gold_ore":  1800,  // 0.18 RELM
  "relm_core:ink_ore":   7500,  // 0.75 RELM — chase tier
};

export function scoreEvent(kind: EventKind, payload: unknown): number {
  switch (kind) {
    case "dignode": {
      const node = getStr(payload, "node") ?? "";
      // Unknown node? 5 bps so future content drops aren't accidentally
      // lucrative until they're explicitly tabled.
      return DIG_BPS[node] ?? 5;
    }
    case "placenode":
      // Building earns dust — discourages place→dig farm cycles while
      // still rewarding the act of building.
      return 5;
    case "hp_change":
      // Easy to self-grief for points. Drop.
      return 0;
    case "death":
      // Don't reward dying.
      return 0;
    default:
      return 0;
  }
}

function getStr(payload: unknown, key: string): string | undefined {
  if (payload && typeof payload === "object" && key in payload) {
    const v = (payload as Record<string, unknown>)[key];
    if (typeof v === "string") return v;
  }
  return undefined;
}

// Convert bps to token wei (token has 18 decimals). 1 RELM = 10000 bps.
// wei = bps * 1e18 / 10000 = bps * 1e14
export function bpsToWei(bps: number): bigint {
  return BigInt(bps) * 10n ** 14n;
}
