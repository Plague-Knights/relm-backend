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
const DIG_BPS: Record<string, number> = {
  "relm_core:stone":    100,   // 0.01 RELM — common baseline
  "relm_core:dirt":      60,
  "relm_core:grass":     60,
  "relm_core:sand":      60,
  "relm_core:tree":     180,   // trees are finite per chunk, worth more
  "relm_core:leaves":    20,
  "relm_core:wood":      40,   // crafted, prevents placecycle farming

  "relm_core:coal_ore":  400,  // 0.04 RELM
  "relm_core:iron_ore":  900,  // 0.09 RELM
  "relm_core:gold_ore": 2000,  // 0.20 RELM
  "relm_core:ink_ore":  6000,  // 0.60 RELM — the chase tier
};

export function scoreEvent(kind: EventKind, payload: unknown): number {
  switch (kind) {
    case "dignode": {
      const node = getStr(payload, "node") ?? "";
      return DIG_BPS[node] ?? 30;
    }
    case "placenode":
      // Half-credit for placing stone/wood — rewards building without
      // fully paying the dig price twice via dig/place cycles.
      return 50;
    case "hp_change":
      // Don't pay for damage events; easy to self-grief for points.
      return 0;
    case "death":
      // Minor consolation so players aren't punished emotionally by a
      // pause in their reward stream.
      return 20;
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
