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

export function scoreEvent(kind: EventKind, payload: unknown): number {
  switch (kind) {
    case "dignode": {
      // 1 point per block dug. Bumped for rarer nodes once we add them.
      const node = getStr(payload, "node");
      if (node === "relm_core:stone") return 100; // 0.01 RELM
      if (node === "relm_core:dirt" || node === "relm_core:grass") return 60;
      return 30;
    }
    case "placenode":
      // Half-credit for placing — rewards building without fully
      // paying the dig price twice.
      return 50;
    case "hp_change":
      // Don't pay for damage events; it's easy to self-grief for points.
      return 0;
    case "death":
      // Minor consolation so players aren't punished emotionally by
      // a pause in their reward stream.
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
