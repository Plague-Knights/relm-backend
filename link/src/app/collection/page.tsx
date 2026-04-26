"use client";

// /collection — 1000-fighter NFT preview gallery. Reads
// /nft/manifest.json (committed in public/), shows a paginated grid.
// Each card links to /fighters/<id> for the per-fighter detail page.

import { useEffect, useState } from "react";

type Entry = {
  tokenId: number;
  id: string;
  name: string;
  image: string;
  iso: string;
  ingame: string;
  threeQuarter: string;
  skin: string;
  metadata: string;
  tier: string;
};

type Manifest = {
  count: number;
  generatedAt: string;
  rarityDistribution?: Record<string, number>;
  fighters: Entry[];
};

const TIER_COLORS: Record<string, string> = {
  Common:    "#9aa0a6",
  Uncommon:  "#7fff9b",
  Rare:      "#7fc3ff",
  Epic:      "#c97fff",
  Legendary: "#ffd040",
};

const PAGE_SIZE = 60;

export default function CollectionPage() {
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetch("/nft/manifest.json").then((r) => r.json()).then(setManifest).catch(() => {});
  }, []);

  const [tierFilter, setTierFilter] = useState<string | null>(null);

  const filtered = manifest
    ? manifest.fighters.filter(f => {
        if (tierFilter && f.tier !== tierFilter) return false;
        if (!search) return true;
        const q = search.toLowerCase();
        return f.name.toLowerCase().includes(q) || String(f.tokenId).includes(q);
      })
    : [];
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const slice = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  return (
    <div style={{
      minHeight: "100vh",
      background: "radial-gradient(circle at 50% 0%, #281121 0%, #0a0810 60%)",
      color: "#fff",
      padding: "44px 24px 80px",
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, system-ui, sans-serif",
    }}>
      <div style={{ maxWidth: 1180, margin: "0 auto" }}>
        <h1 style={{
          fontSize: 38, fontWeight: 800, letterSpacing: "-0.03em", margin: 0,
          background: "linear-gradient(90deg, #fff 0%, #ffd040 70%, #ff8a3d 100%)",
          WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
        }}>RELM Genesis · 1,000 fighters</h1>
        <p style={{ opacity: 0.7, fontSize: 14, marginTop: 10, marginBottom: 22, maxWidth: 720 }}>
          Procedurally rendered, deterministic from on-chain id. Five trait
          categories (background, helmet, armor, weapon, hair) plus rolled
          stats (power 25-95, speed 25-95, luck 25-95). Owners use their
          fighter as their in-game skin and earn match prize-pool cuts when
          their fighter wins.
        </p>

        {!manifest && <div style={{ opacity: 0.6 }}>loading manifest…</div>}

        {manifest && (
          <>
            <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 18, flexWrap: "wrap" }}>
              <input
                type="text"
                placeholder="search by name or token id…"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(0); }}
                style={{
                  flex: 1, minWidth: 200, padding: "10px 14px",
                  background: "rgba(255,255,255,0.05)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: 10,
                  color: "#fff",
                  fontSize: 14,
                  outline: "none",
                }}
              />
              <div style={{ fontSize: 13, opacity: 0.65 }}>
                {filtered.length === manifest.count
                  ? `${manifest.count} fighters`
                  : `${filtered.length} / ${manifest.count}`}
              </div>
            </div>

            {manifest.rarityDistribution && (
              <div style={{ display: "flex", gap: 8, marginBottom: 18, flexWrap: "wrap" }}>
                {(["Common", "Uncommon", "Rare", "Epic", "Legendary"] as const).map((t) => {
                  const count = manifest.rarityDistribution?.[t] ?? 0;
                  const active = tierFilter === t;
                  return (
                    <button
                      key={t}
                      onClick={() => { setTierFilter(active ? null : t); setPage(0); }}
                      style={{
                        padding: "6px 12px",
                        fontSize: 12, fontWeight: 700, letterSpacing: "0.04em",
                        background: active ? `${TIER_COLORS[t]}22` : "rgba(255,255,255,0.04)",
                        color: TIER_COLORS[t],
                        border: `1px solid ${active ? TIER_COLORS[t] : "rgba(255,255,255,0.1)"}`,
                        borderRadius: 999,
                        cursor: "pointer",
                      }}
                    >
                      {t} <span style={{ opacity: 0.6, marginLeft: 4 }}>{count}</span>
                    </button>
                  );
                })}
              </div>
            )}

            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
              gap: 12,
            }}>
              {slice.map((f) => {
                const tierColor = TIER_COLORS[f.tier] ?? "#9aa0a6";
                return (
                  <a key={f.tokenId} href={`/fighters/${f.id}`} style={{
                    textDecoration: "none", color: "#fff",
                    background: "rgba(255,255,255,0.04)",
                    border: `1px solid ${tierColor}33`,
                    boxShadow: f.tier === "Legendary" ? `0 0 20px ${tierColor}55` : "none",
                    borderRadius: 12,
                    padding: 10,
                    display: "flex", flexDirection: "column", gap: 6,
                    position: "relative",
                    transition: "transform 120ms, border-color 120ms",
                  }}>
                    <img src={f.image} alt={f.name} loading="lazy" style={{
                      width: "100%", aspectRatio: "1 / 1", objectFit: "cover",
                      borderRadius: 8, background: "rgba(0,0,0,0.3)",
                      imageRendering: "pixelated",
                    }} />
                    <div style={{
                      position: "absolute", top: 14, right: 14,
                      padding: "2px 7px", borderRadius: 4,
                      background: "rgba(0,0,0,0.55)",
                      color: tierColor,
                      fontSize: 9, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase",
                    }}>{f.tier}</div>
                    <div style={{ fontSize: 13, fontWeight: 700, marginTop: 2 }}>{f.name}</div>
                    <div style={{ fontSize: 11, opacity: 0.55 }}>#{f.tokenId.toString().padStart(4, "0")}</div>
                  </a>
                );
              })}
            </div>

            {pages > 1 && (
              <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 28 }}>
                <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}
                        style={pageBtnStyle(page === 0)}>◀ prev</button>
                <div style={{ padding: "10px 16px", fontSize: 13, opacity: 0.7 }}>
                  page {page + 1} / {pages}
                </div>
                <button onClick={() => setPage((p) => Math.min(pages - 1, p + 1))} disabled={page >= pages - 1}
                        style={pageBtnStyle(page >= pages - 1)}>next ▶</button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function pageBtnStyle(disabled: boolean): React.CSSProperties {
  return {
    padding: "10px 16px",
    background: "rgba(255,255,255,0.05)",
    border: "1px solid rgba(255,255,255,0.1)",
    color: "#fff",
    borderRadius: 8,
    cursor: disabled ? "default" : "pointer",
    opacity: disabled ? 0.3 : 1,
    fontSize: 13,
  };
}
