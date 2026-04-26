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
      <div style={{ maxWidth: 1080, margin: "0 auto" }}>
        <h1 style={{
          fontSize: 38, fontWeight: 800, letterSpacing: "-0.03em", margin: 0,
          background: "linear-gradient(90deg, #fff 0%, #ffd040 70%, #ff8a3d 100%)",
          WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
        }}>Shop</h1>
        <p style={{ opacity: 0.7, fontSize: 14, marginTop: 12, marginBottom: 22, maxWidth: 720 }}>
          Cosmetic items for your in-game character. One-time purchases via Stripe.
          Cosmetic only — no pay-to-win.
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
            gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
            gap: 14,
          }}>
            {items.map((t) => {
              const accent = RARITY_COLORS[t.rarity] ?? "#9aa0a6";
              return (
                <div key={t.id} style={{
                  background: "rgba(255,255,255,0.04)",
                  border: `1px solid ${accent}33`,
                  boxShadow: t.rarity === "legendary" ? `0 0 30px ${accent}44` : undefined,
                  borderRadius: 14,
                  padding: 14,
                  display: "flex", flexDirection: "column", gap: 8,
                  position: "relative",
                }}>
                  <div style={{
                    width: "100%", aspectRatio: "1 / 1",
                    background: "rgba(0,0,0,0.3)", borderRadius: 10,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    overflow: "hidden",
                  }}>
                    <img src={t.image} alt={t.name} style={{
                      maxWidth: "75%", maxHeight: "75%",
                      objectFit: "contain", imageRendering: "pixelated",
                    }} onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                  </div>
                  <div style={{ position: "absolute", top: 18, right: 18,
                    padding: "2px 7px", borderRadius: 4,
                    background: "rgba(0,0,0,0.55)", color: accent,
                    fontSize: 9, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase",
                  }}>{t.rarity}</div>
                  <div style={{ fontSize: 14, fontWeight: 700, marginTop: 2 }}>{t.name}</div>
                  <div style={{ fontSize: 12, opacity: 0.65, lineHeight: 1.5 }}>{t.description}</div>
                  {t.perks.length > 0 && (
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                      {t.perks.map((p) => (
                        <span key={p} style={{
                          fontSize: 9, padding: "2px 6px", borderRadius: 4,
                          background: "rgba(127,195,255,0.15)", color: "#7fc3ff",
                          letterSpacing: "0.06em", textTransform: "uppercase", fontWeight: 600,
                        }}>{p}</span>
                      ))}
                    </div>
                  )}
                  <button
                    onClick={() => buy(t)}
                    disabled={!t.buyable || busy !== null}
                    style={{
                      marginTop: 6, padding: "10px 14px",
                      background: t.buyable
                        ? "linear-gradient(135deg, #ffd040, #ff8a3d)"
                        : "rgba(255,255,255,0.08)",
                      color: t.buyable ? "#1a0a05" : "#aaa",
                      fontWeight: 700, fontSize: 14,
                      border: "none", borderRadius: 8,
                      cursor: t.buyable ? "pointer" : "not-allowed",
                    }}
                  >
                    {busy === t.id ? "…" : t.buyable ? `$${t.priceUsd.toFixed(2)}` : "coming soon"}
                  </button>
                </div>
              );
            })}
          </div>
        )}

        <div style={{ marginTop: 36, fontSize: 12, opacity: 0.45, textAlign: "center" }}>
          purchased items appear on your in-game character automatically on next join · stripe billing · refunds within 14 days
        </div>
      </div>
    </div>
  );
}
