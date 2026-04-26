"use client";

// /mint — Genesis fighter NFT mint page. Pulls from the static
// manifest, picks one not-yet-claimed token, lets the connected wallet
// reserve + mint it for a flat ETH price + a small RELM burn cut.
//
// This is a v1 mockup wired to the existing /api/fighters/select
// endpoint for skin assignment. Real on-chain ERC-721 mint flow is the
// next step (RelmGenesis contract, mintByTokenId).

import { useEffect, useMemo, useState } from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAccount } from "wagmi";

type Entry = {
  tokenId: number;
  id: string;
  name: string;
  image: string;
  iso: string;
  threeQuarter: string;
  metadata: string;
  tier: string;
};

type Manifest = {
  count: number;
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

const PRICE_ETH = 0.005;

export default function MintPage() {
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [picked, setPicked] = useState<Entry | null>(null);
  const [revealing, setRevealing] = useState(false);
  const [revealed, setRevealed] = useState<Entry | null>(null);
  const { isConnected } = useAccount();

  useEffect(() => {
    fetch("/nft/manifest.json").then((r) => r.json()).then(setManifest).catch(() => {});
  }, []);

  // Pick a random unminted fighter for the "next mint preview" card.
  // Real version reads the on-chain mint state to know what's claimed.
  const featured = useMemo(() => {
    if (!manifest) return null;
    const seed = (Date.now() / 60000) | 0;
    return manifest.fighters[seed % manifest.fighters.length] ?? null;
  }, [manifest]);

  function reveal() {
    if (!manifest) return;
    setRevealing(true);
    setRevealed(null);
    // Animated reveal: cycle through 8 random fighters then settle on one.
    let n = 0;
    const interval = setInterval(() => {
      const idx = Math.floor(Math.random() * manifest.fighters.length);
      setPicked(manifest.fighters[idx]!);
      n++;
      if (n >= 12) {
        clearInterval(interval);
        const final = manifest.fighters[Math.floor(Math.random() * manifest.fighters.length)]!;
        setPicked(final);
        setRevealed(final);
        setRevealing(false);
      }
    }, 120);
  }

  return (
    <div style={{
      minHeight: "100vh",
      background: "radial-gradient(circle at 50% 0%, #281121 0%, #0a0810 60%)",
      color: "#fff",
      padding: "44px 24px 80px",
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, system-ui, sans-serif",
    }}>
      <div style={{ maxWidth: 980, margin: "0 auto" }}>
        <div style={{ display: "inline-block", padding: "4px 12px", borderRadius: 999,
          background: "rgba(255,208,64,0.12)", border: "1px solid rgba(255,208,64,0.3)",
          color: "#ffd040", fontSize: 11, fontWeight: 700, letterSpacing: "0.1em",
          textTransform: "uppercase", marginBottom: 14 }}>genesis · 1,000 supply</div>
        <h1 style={{ fontSize: 44, fontWeight: 800, letterSpacing: "-0.03em", margin: 0,
          background: "linear-gradient(90deg, #fff 0%, #ffd040 70%, #ff8a3d 100%)",
          WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
          Mint a Fighter
        </h1>
        <p style={{ fontSize: 15, lineHeight: 1.6, opacity: 0.7, marginTop: 14, maxWidth: 680 }}>
          Each mint reveals a procedurally-rolled fighter — five trait categories,
          tier-bound stats, and a unique skin atlas your character wears in-game.
          Reveal animation locks the token, then your wallet signs the on-chain mint.
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 22, marginTop: 32 }}>
          {/* Reveal card */}
          <div style={{
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 16,
            padding: 22,
            display: "flex", flexDirection: "column", gap: 12,
            minHeight: 480,
          }}>
            <div style={{ fontSize: 11, opacity: 0.55, textTransform: "uppercase", letterSpacing: "0.16em", fontWeight: 600 }}>
              {revealing ? "rolling…" : revealed ? "your fighter" : "preview"}
            </div>
            <div style={{ position: "relative", aspectRatio: "1 / 1", borderRadius: 12,
              background: "rgba(0,0,0,0.4)", overflow: "hidden",
              border: revealed ? `2px solid ${TIER_COLORS[revealed.tier] ?? "#fff"}` : "1px solid rgba(255,255,255,0.06)",
              boxShadow: revealed?.tier === "Legendary" ? `0 0 40px ${TIER_COLORS.Legendary}88` : undefined,
            }}>
              {(picked ?? featured) && (
                <img src={(picked ?? featured)!.image}
                     alt={(picked ?? featured)!.name}
                     style={{ width: "100%", height: "100%", objectFit: "cover", imageRendering: "pixelated" }} />
              )}
              {revealing && (
                <div style={{ position: "absolute", inset: 0, background: "linear-gradient(45deg, transparent 0%, rgba(255,208,64,0.15) 50%, transparent 100%)", animation: "shimmer 0.6s linear infinite" }} />
              )}
            </div>
            {revealed ? (
              <>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ fontSize: 22, fontWeight: 800 }}>{revealed.name}</div>
                  <span style={{
                    padding: "3px 10px", borderRadius: 6,
                    background: `${TIER_COLORS[revealed.tier]}22`,
                    color: TIER_COLORS[revealed.tier],
                    fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase",
                  }}>{revealed.tier}</span>
                </div>
                <div style={{ fontSize: 13, opacity: 0.65 }}>#{revealed.tokenId.toString().padStart(4, "0")}</div>
                <button disabled={!isConnected} style={{
                  marginTop: 8, padding: "13px 22px",
                  background: "linear-gradient(135deg, #ffd040, #ff8a3d)",
                  color: "#1a0a05", fontWeight: 700, fontSize: 15,
                  border: "none", borderRadius: 10,
                  cursor: isConnected ? "pointer" : "not-allowed",
                  opacity: isConnected ? 1 : 0.5,
                }}>
                  Mint for {PRICE_ETH} ETH
                </button>
              </>
            ) : (
              <button disabled={revealing || !manifest} onClick={reveal}
                style={{
                  marginTop: 8, padding: "13px 22px",
                  background: revealing ? "rgba(255,255,255,0.1)" : "linear-gradient(135deg, #ffd040, #ff8a3d)",
                  color: revealing ? "#fff" : "#1a0a05",
                  fontWeight: 700, fontSize: 15,
                  border: "none", borderRadius: 10,
                  cursor: revealing ? "not-allowed" : "pointer",
                }}>
                {revealing ? "Revealing…" : "Reveal & Roll"}
              </button>
            )}
          </div>

          {/* Stats / disclosure */}
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 14, padding: 18 }}>
              <div style={{ fontSize: 11, opacity: 0.55, textTransform: "uppercase", letterSpacing: "0.16em", marginBottom: 10 }}>rarity odds</div>
              {manifest?.rarityDistribution && (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {(["Common", "Uncommon", "Rare", "Epic", "Legendary"] as const).map((t) => {
                    const count = manifest.rarityDistribution?.[t] ?? 0;
                    const pct = (count / manifest.count) * 100;
                    return (
                      <div key={t} style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                        <span style={{ color: TIER_COLORS[t], fontWeight: 600 }}>{t}</span>
                        <span style={{ opacity: 0.7 }}>{pct.toFixed(1)}% · {count}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 14, padding: 18 }}>
              <div style={{ fontSize: 11, opacity: 0.55, textTransform: "uppercase", letterSpacing: "0.16em", marginBottom: 10 }}>what you get</div>
              <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7, fontSize: 13, opacity: 0.85 }}>
                <li>1 ERC-721 NFT on Soneium Minato</li>
                <li>5 trait categories rolled deterministically</li>
                <li>Tier-bound stats (Legendary mines ~2× faster)</li>
                <li>In-game skin: <code style={{ background: "rgba(255,255,255,0.1)", padding: "1px 5px", borderRadius: 3 }}>/myfighter</code> wears it</li>
                <li>Match prize-pool cuts when your fighter wins</li>
              </ul>
            </div>

            <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 14, padding: 18 }}>
              <div style={{ fontSize: 11, opacity: 0.55, textTransform: "uppercase", letterSpacing: "0.16em", marginBottom: 10 }}>connect to mint</div>
              <ConnectButton chainStatus="icon" />
            </div>
          </div>
        </div>

        <div style={{ marginTop: 36, fontSize: 12, opacity: 0.5, textAlign: "center" }}>
          <a href="/collection" style={{ color: "rgba(255,255,255,0.65)" }}>browse all 1000 →</a>
          <span style={{ margin: "0 8px" }}>·</span>
          <a href="/play" style={{ color: "rgba(255,255,255,0.65)" }}>← back to play</a>
        </div>
      </div>

      <style>{`
        @keyframes shimmer {
          0%   { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
      `}</style>
    </div>
  );
}
