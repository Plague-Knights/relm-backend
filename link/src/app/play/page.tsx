"use client";

// /play — RELM landing page. The shareable URL we point partners,
// twitter, and IG bio at. Live econ stats, connect-wallet flow that
// shows the player's in-game RELM balance, download CTA, and a "how
// it works" walkthrough.

import { useEffect, useState } from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAccount } from "wagmi";

const API = process.env.NEXT_PUBLIC_RELM_BACKEND_URL || "";

type EconStats = {
  minted: number;
  burned: number;
  treasury: number;
  circulating: number;
};

export default function PlayPage() {
  const [econ, setEcon] = useState<EconStats | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const { address, isConnected } = useAccount();

  useEffect(() => {
    fetch(`${API}/api/economy/stats`).then((r) => r.json()).then(setEcon).catch(() => {});
    const t = setInterval(() => {
      fetch(`${API}/api/economy/stats`).then((r) => r.json()).then(setEcon).catch(() => {});
    }, 8000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!address) { setBalance(null); return; }
    fetch(`${API}/api/cosmetics/balance/${address}`)
      .then((r) => r.json())
      .then((d) => setBalance(typeof d.balanceBps === "number" ? d.balanceBps : 0))
      .catch(() => setBalance(0));
  }, [address]);

  return (
    <>
      <style>{`
        @keyframes bgshift {
          0%, 100% { background-position: 0% 50%; }
          50%      { background-position: 100% 50%; }
        }
        .play-bg {
          background: radial-gradient(circle at 50% 0%, #281121 0%, #0a0810 60%),
                      linear-gradient(135deg, #1a0d24 0%, #281019 50%, #1d1129 100%);
          background-size: 100% 100%, 200% 200%;
          animation: bgshift 22s ease infinite;
        }
        .play-tile {
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 14px;
          padding: 18px;
        }
        .play-cta {
          display: inline-block;
          padding: 13px 22px;
          border-radius: 10px;
          background: linear-gradient(135deg, #ffd040, #ff8a3d);
          color: #1a0a05;
          font-weight: 700;
          font-size: 15px;
          text-decoration: none;
          letter-spacing: 0.01em;
          transition: transform 120ms;
        }
        .play-cta:hover { transform: translateY(-1px); }
        .play-num { font-variant-numeric: tabular-nums; font-feature-settings: "tnum"; }
      `}</style>

      <div className="play-bg" style={{
        minHeight: "100vh", color: "#fff",
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, system-ui, sans-serif",
      }}>
        <div style={{ maxWidth: 980, margin: "0 auto", padding: "56px 24px 80px" }}>

          {/* Hero */}
          <header style={{ marginBottom: 48 }}>
            <div style={{
              display: "inline-block",
              padding: "4px 12px", borderRadius: 999,
              background: "rgba(255,208,64,0.12)",
              border: "1px solid rgba(255,208,64,0.3)",
              color: "#ffd040",
              fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase",
              marginBottom: 16,
            }}>● live · provably fair</div>
            <h1 style={{
              fontSize: 52, fontWeight: 800, margin: 0,
              letterSpacing: "-0.03em", lineHeight: 1.05,
              background: "linear-gradient(90deg, #fff 0%, #ffd040 70%, #ff8a3d 100%)",
              WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
              backgroundClip: "text", color: "transparent",
            }}>RELM — mine, earn, burn</h1>
            <p style={{
              fontSize: 17, lineHeight: 1.6, opacity: 0.7, marginTop: 18, maxWidth: 620,
            }}>
              First-to-diamond mining race on a voxel world. Every match commits a sha256(seed)
              before it starts; the diamond's location is bound to that hash. Win the race,
              earn RELM. Spend it on cosmetics, upgrades, plot tax — half of every spend is
              permanently burned.
            </p>
            <div style={{ display: "flex", gap: 12, marginTop: 28, flexWrap: "wrap" }}>
              <a className="play-cta" href="/download">Download client</a>
              <ConnectButton chainStatus="icon" />
            </div>
          </header>

          {/* Wallet card */}
          {isConnected && (
            <div className="play-tile" style={{ marginBottom: 36, display: "flex", gap: 20, alignItems: "center", flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: 200 }}>
                <div style={{ fontSize: 11, opacity: 0.5, textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 6 }}>linked wallet</div>
                <div className="play-num" style={{ fontSize: 14, fontFamily: "monospace" }}>
                  {address?.slice(0, 8)}…{address?.slice(-6)}
                </div>
              </div>
              <div style={{ minWidth: 200 }}>
                <div style={{ fontSize: 11, opacity: 0.5, textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 6 }}>in-game balance</div>
                <div className="play-num" style={{ fontSize: 22, fontWeight: 700, color: "#ffd040" }}>
                  {balance === null ? "—" : `${(balance / 10000).toFixed(4)} RELM`}
                </div>
              </div>
            </div>
          )}

          {/* Live econ */}
          <section style={{ marginBottom: 44 }}>
            <h2 style={{ fontSize: 13, opacity: 0.55, textTransform: "uppercase", letterSpacing: "0.16em", margin: "0 0 14px", fontWeight: 600 }}>token economy · live</h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
              <EconCard label="minted" value={econ?.minted} accent="#88e7ff" />
              <EconCard label="burned 🔥" value={econ?.burned} accent="#ff7a7a" />
              <EconCard label="treasury" value={econ?.treasury} accent="#ffd040" />
              <EconCard label="circulating" value={econ?.circulating} accent="#7fff9b" />
            </div>
            <div style={{ fontSize: 12, opacity: 0.55, marginTop: 10 }}>
              every cosmetic, upgrade, tournament fee, and land tax routes 50% to burn.
              the more you play, the deflationary the token.
            </div>
          </section>

          {/* How it works */}
          <section style={{ marginBottom: 44 }}>
            <h2 style={{ fontSize: 13, opacity: 0.55, textTransform: "uppercase", letterSpacing: "0.16em", margin: "0 0 14px", fontWeight: 600 }}>how it works</h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12 }}>
              <Step n={1} title="Connect wallet" body="ETH wallet on Soneium Minato. We sign-in-with-ethereum and link your gameplay name." />
              <Step n={2} title="Download + mine" body="Run the launcher, dig the world. Every block break = RELM credit through antiBot + dailyCap." />
              <Step n={3} title="Win or upgrade" body="Strike diamond → match prize pool. Or spend RELM on pickaxe tiers, cosmetics, plots." />
              <Step n={4} title="Half burned, half pooled" body="Every sink burns 50% forever, treasury keeps 50% for tournaments. Mint-burn ratio published live." />
            </div>
          </section>

          {/* Sinks */}
          <section style={{ marginBottom: 44 }}>
            <h2 style={{ fontSize: 13, opacity: 0.55, textTransform: "uppercase", letterSpacing: "0.16em", margin: "0 0 14px", fontWeight: 600 }}>sink surface</h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
              <SinkRow title="Cosmetic shop" subtitle="capes, pickaxe skins, founder NFTs" burn="50%" />
              <SinkRow title="Pickaxe upgrades" subtitle="wood → ink, 0/100/500/2500/10000 RELM" burn="50%" />
              <SinkRow title="Land plot tax" subtitle="tier × 10 RELM/day or plot lapses" burn="50%" />
              <SinkRow title="Mine-cap unlock" subtitle="+50% daily cap, 250 RELM" burn="50%" />
              <SinkRow title="Tournament fees" subtitle="prize pool & spectator bet house cuts" burn="50%" />
              <SinkRow title="Ore conversion" subtitle="raw ore → RELM credit" burn="5%" />
            </div>
          </section>

          {/* Footer */}
          <footer style={{ fontSize: 11, opacity: 0.4, textAlign: "center", paddingTop: 36, lineHeight: 1.7 }}>
            <a href="/b/glitchdgamba" style={{ color: "rgba(255,255,255,0.55)", textDecoration: "none" }}>@glitchdgamba</a>
            <span style={{ margin: "0 8px" }}>·</span>
            <a href="/matches" style={{ color: "rgba(255,255,255,0.55)", textDecoration: "none" }}>live matches</a>
            <span style={{ margin: "0 8px" }}>·</span>
            <a href="/shop" style={{ color: "rgba(255,255,255,0.55)", textDecoration: "none" }}>shop</a>
            <div style={{ marginTop: 10 }}>18+ · gamble responsibly · soneium minato testnet</div>
          </footer>
        </div>
      </div>
    </>
  );
}

function EconCard({ label, value, accent }: { label: string; value: number | undefined; accent: string }) {
  const v = typeof value === "number" ? (value / 10000).toFixed(0) : "—";
  return (
    <div className="play-tile">
      <div style={{ fontSize: 11, opacity: 0.55, textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 8 }}>{label}</div>
      <div className="play-num" style={{ fontSize: 26, fontWeight: 700, color: accent }}>{v}</div>
      <div style={{ fontSize: 11, opacity: 0.4, marginTop: 2 }}>RELM</div>
    </div>
  );
}

function Step({ n, title, body }: { n: number; title: string; body: string }) {
  return (
    <div className="play-tile">
      <div style={{ fontSize: 11, opacity: 0.4, marginBottom: 8 }}>0{n}</div>
      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>{title}</div>
      <div style={{ fontSize: 13, opacity: 0.7, lineHeight: 1.5 }}>{body}</div>
    </div>
  );
}

function SinkRow({ title, subtitle, burn }: { title: string; subtitle: string; burn: string }) {
  return (
    <div className="play-tile" style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px" }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 700 }}>{title}</div>
        <div style={{ fontSize: 12, opacity: 0.6, marginTop: 2 }}>{subtitle}</div>
      </div>
      <div style={{
        fontSize: 11, fontWeight: 700, letterSpacing: "0.06em",
        padding: "4px 8px", borderRadius: 6,
        background: "rgba(255,122,122,0.15)", color: "#ff7a7a",
      }}>BURN {burn}</div>
    </div>
  );
}
