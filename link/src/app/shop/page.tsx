"use client";

// /shop — Stripe-paid cosmetic store. No wallet, no on-chain mint.
// Items render with USD prices, click → enter username → Stripe
// Checkout → webhook credits the cosmetic. Lua mod fetches owned
// cosmetics via /api/shop/owned/:player on join.

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

type Item = {
  id: string;
  name: string;
  description: string;
  image: string;
  slot: string;
  rarity: string;
  priceUsd: number;
  perks: string[];
  buyable: boolean;
};

const RARITY_COLORS: Record<string, string> = {
  common:    "#9aa0a6",
  uncommon:  "#7fff9b",
  rare:      "#7fc3ff",
  epic:      "#c97fff",
  legendary: "#ffd040",
};

export default function ShopPage() {
  const params = useSearchParams();
  const justBought = params?.get("bought");
  const [items, setItems] = useState<Item[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/shop/list").then((r) => r.json()).then((d) => setItems(d.items)).catch((e) => setError(String(e)));
  }, []);

  async function buy(item: Item) {
    setBusy(item.id);
    setError(null);
    try {
      const player = window.prompt("Enter your in-game username:") ?? "";
      if (!player.trim()) { setBusy(null); return; }
      const r = await fetch("/api/shop/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ player: player.trim(), cosmeticId: item.id }),
      });
      const d = await r.json();
      if (d.url) { window.location.href = d.url; return; }
      setError(d.error ?? `error ${r.status}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div style={{
      minHeight: "100vh",
      background: "radial-gradient(circle at 50% 0%, #281121 0%, #0a0810 60%)",
      color: "#fff",
      padding: "44px 24px 80px",
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, system-ui, sans-serif",
    }}>
      <div style={{ maxWidth: 1180, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 16, flexWrap: "wrap", marginBottom: 6 }}>
          <h1 style={{
            fontSize: 44, fontWeight: 800, letterSpacing: "-0.03em", margin: 0,
            background: "linear-gradient(90deg, #fff 0%, #ffd040 70%, #ff8a3d 100%)",
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
          }}>Shop</h1>
          <span style={{
            padding: "4px 12px", borderRadius: 999,
            background: "rgba(127,255,155,0.12)",
            border: "1px solid rgba(127,255,155,0.3)",
            color: "#7fff9b", fontSize: 11, fontWeight: 700, letterSpacing: "0.1em",
            textTransform: "uppercase",
          }}>● cosmetics only</span>
        </div>
        <p style={{ opacity: 0.65, fontSize: 14, marginTop: 8, marginBottom: 26, maxWidth: 680, lineHeight: 1.6 }}>
          Customize your character with capes, trails, pickaxe skins, and name colors.
          One-time purchases via Stripe. <b>Cosmetic only — no pay-to-win.</b>
        </p>

        {justBought && (
          <div style={{
            padding: 14, background: "rgba(127,255,155,0.08)",
            border: "1px solid rgba(127,255,155,0.3)",
            borderRadius: 10, color: "#7fff9b", marginBottom: 20, fontSize: 14,
          }}>
            ✓ Purchased <b>{justBought}</b>. It'll appear on your in-game character on next join.
          </div>
        )}
        {error && (
          <div style={{ padding: 12, background: "rgba(255,122,122,0.08)",
            border: "1px solid rgba(255,122,122,0.3)", borderRadius: 10,
            color: "#ff7a7a", marginBottom: 20, fontSize: 14 }}>{error}</div>
        )}

        {!items && <div style={{ opacity: 0.6 }}>loading shop…</div>}

        {items && (
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
            gap: 16,
          }}>
            {items.map((t) => {
              const accent = RARITY_COLORS[t.rarity] ?? "#9aa0a6";
              const isLegendary = t.rarity === "legendary";
              return (
                <div key={t.id} className="shop-card" style={{
                  background: isLegendary
                    ? `linear-gradient(180deg, rgba(255,208,64,0.08) 0%, rgba(255,255,255,0.04) 100%)`
                    : "rgba(255,255,255,0.04)",
                  border: `1px solid ${accent}55`,
                  boxShadow: isLegendary ? `0 0 40px ${accent}66, inset 0 0 30px ${accent}11` : undefined,
                  borderRadius: 16,
                  padding: 0,
                  display: "flex", flexDirection: "column",
                  position: "relative",
                  overflow: "hidden",
                  transition: "transform 160ms ease, border-color 160ms ease",
                }}>
                  {/* Rarity stripe at top */}
                  <div style={{
                    height: 4, width: "100%",
                    background: `linear-gradient(90deg, ${accent}, ${accent}88)`,
                  }} />

                  {/* Image area — bigger, with gradient backdrop matching rarity */}
                  <div style={{
                    width: "100%", aspectRatio: "1 / 1",
                    background: `radial-gradient(circle at 50% 40%, ${accent}22 0%, rgba(0,0,0,0.45) 75%)`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    overflow: "hidden",
                    position: "relative",
                  }}>
                    <img src={t.image} alt={t.name} style={{
                      maxWidth: "70%", maxHeight: "70%",
                      objectFit: "contain", imageRendering: "pixelated",
                      filter: isLegendary ? `drop-shadow(0 0 16px ${accent}aa)` : undefined,
                    }} onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                    <div style={{
                      position: "absolute", top: 12, right: 12,
                      padding: "3px 9px", borderRadius: 6,
                      background: "rgba(0,0,0,0.6)",
                      backdropFilter: "blur(4px)",
                      color: accent,
                      fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase",
                    }}>{t.rarity}</div>
                    <div style={{
                      position: "absolute", top: 12, left: 12,
                      padding: "3px 9px", borderRadius: 6,
                      background: "rgba(0,0,0,0.6)",
                      backdropFilter: "blur(4px)",
                      color: "#ddd",
                      fontSize: 10, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase",
                    }}>{t.slot.replace("_", " ")}</div>
                  </div>

                  {/* Content + CTA */}
                  <div style={{ padding: "16px 18px 18px", display: "flex", flexDirection: "column", gap: 8 }}>
                    <div style={{ fontSize: 17, fontWeight: 700, letterSpacing: "-0.01em" }}>{t.name}</div>
                    <div style={{ fontSize: 13, opacity: 0.65, lineHeight: 1.5, minHeight: 40 }}>{t.description}</div>
                    {t.perks.length > 0 && (
                      <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 2 }}>
                        {t.perks.map((p) => (
                          <span key={p} style={{
                            fontSize: 9.5, padding: "3px 8px", borderRadius: 4,
                            background: "rgba(127,195,255,0.12)", color: "#7fc3ff",
                            letterSpacing: "0.06em", textTransform: "uppercase", fontWeight: 600,
                          }}>{p}</span>
                        ))}
                      </div>
                    )}
                    <button
                      onClick={() => buy(t)}
                      disabled={!t.buyable || busy !== null}
                      style={{
                        marginTop: 10, padding: "12px 16px",
                        background: t.buyable
                          ? "linear-gradient(135deg, #ffd040, #ff8a3d)"
                          : "rgba(255,255,255,0.06)",
                        color: t.buyable ? "#1a0a05" : "#888",
                        fontWeight: 700, fontSize: 15,
                        border: "none", borderRadius: 10,
                        cursor: t.buyable ? "pointer" : "not-allowed",
                        transition: "transform 100ms",
                      }}
                    >
                      {busy === t.id ? "…" : t.buyable ? `Buy · $${t.priceUsd.toFixed(2)}` : "Coming soon"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <style>{`
          .shop-card:hover {
            transform: translateY(-3px);
          }
        `}</style>

        <div style={{ marginTop: 36, fontSize: 12, opacity: 0.45, textAlign: "center" }}>
          purchased items appear on your in-game character automatically on next join · stripe billing · refunds within 14 days
        </div>
      </div>
    </div>
  );
}
