"use client";

// /play — landing page. Open-world voxel mining game with monthly
// membership. No on-chain currency, no NFT mint, no automated
// gambling — those are stripped to keep the product simple and
// regulatory-friendly. Tournaments still happen but are run manually
// off-platform with announced prize pools.

import { useState } from "react";

const PRICE_GAMBLER = "$9.99";
const PRICE_VIP = "$29.99";

async function startCheckout(tier: "premium" | "vip") {
  const player = window.prompt("Enter your in-game username:") ?? "";
  if (!player.trim()) return;
  const r = await fetch("/api/billing/checkout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ player: player.trim(), tier }),
  });
  const d = await r.json();
  if (d.url) window.location.href = d.url;
  else alert(d.error ?? "Checkout failed");
}

export default function PlayPage() {
  const [busy, setBusy] = useState<string | null>(null);
  const click = async (tier: "premium" | "vip") => {
    setBusy(tier);
    try { await startCheckout(tier); }
    finally { setBusy(null); }
  };
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
        .play-tier {
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 14px;
          padding: 22px;
          display: flex; flex-direction: column; gap: 10px;
        }
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
            }}>● beta</div>
            <h1 style={{
              fontSize: 52, fontWeight: 800, margin: 0,
              letterSpacing: "-0.03em", lineHeight: 1.05,
              background: "linear-gradient(90deg, #fff 0%, #ffd040 70%, #ff8a3d 100%)",
              WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
              backgroundClip: "text", color: "transparent",
            }}>Build, mine, fight</h1>
            <p style={{
              fontSize: 17, lineHeight: 1.6, opacity: 0.7, marginTop: 18, maxWidth: 620,
            }}>
              An open-world voxel sandbox. Drop into a server, mine ore,
              build a base, fight other players (or join a peaceful PvE
              server). Persistent worlds, your character your way. No
              matches, no countdowns — just the world and what you do
              in it.
            </p>
            <div style={{ display: "flex", gap: 12, marginTop: 28, flexWrap: "wrap" }}>
              <a className="play-cta" href="/download">Download client</a>
              <a className="play-cta" href="#tiers" style={{
                background: "rgba(255,255,255,0.05)",
                color: "#fff",
                border: "1px solid rgba(255,255,255,0.12)",
              }}>See plans</a>
            </div>
          </header>

          {/* What it is */}
          <section style={{ marginBottom: 44 }}>
            <h2 style={{ fontSize: 13, opacity: 0.55, textTransform: "uppercase", letterSpacing: "0.16em", margin: "0 0 14px", fontWeight: 600 }}>what's in it</h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
              <Feature title="Open-world voxel" body="No timers, no forced match. Mine deep, build tall, explore caves." />
              <Feature title="PvE & PvP servers" body="Pick the vibe. Peaceful builders go to PvE; competitive players get PvP." />
              <Feature title="Pickaxe progression" body="Wood → Stone → Steel → Diamond. Mine faster, hit harder." />
              <Feature title="Cosmetic skins" body="Customize your character with unlockable looks. Cosmetic only — no pay-to-win." />
            </div>
          </section>

          {/* Tiers */}
          <section id="tiers" style={{ marginBottom: 44 }}>
            <h2 style={{ fontSize: 13, opacity: 0.55, textTransform: "uppercase", letterSpacing: "0.16em", margin: "0 0 14px", fontWeight: 600 }}>plans</h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12 }}>
              <div className="play-tier">
                <div style={{ fontSize: 12, opacity: 0.55, textTransform: "uppercase", letterSpacing: "0.12em" }}>free</div>
                <div style={{ fontSize: 32, fontWeight: 800 }}>$0</div>
                <ul style={{ margin: 0, paddingLeft: 16, lineHeight: 1.7, fontSize: 13, opacity: 0.85 }}>
                  <li>Public servers</li>
                  <li>Wood pickaxe</li>
                  <li>Standard server queue</li>
                  <li>Build, mine, explore</li>
                </ul>
              </div>
              <div className="play-tier" style={{ border: "1px solid rgba(255,208,64,0.4)", boxShadow: "0 0 30px rgba(255,208,64,0.15)" }}>
                <div style={{ fontSize: 12, color: "#ffd040", textTransform: "uppercase", letterSpacing: "0.12em" }}>★ premium</div>
                <div style={{ fontSize: 32, fontWeight: 800 }}>{PRICE_GAMBLER}<span style={{ fontSize: 14, opacity: 0.5 }}>/mo</span></div>
                <ul style={{ margin: 0, paddingLeft: 16, lineHeight: 1.7, fontSize: 13, opacity: 0.85 }}>
                  <li>All free tier</li>
                  <li>Stone & Steel pickaxe</li>
                  <li>Priority server queue</li>
                  <li>Custom name color</li>
                  <li>Cosmetic skin pack</li>
                </ul>
                <button className="play-cta" disabled={busy !== null}
                  onClick={() => click("premium")}
                  style={{ marginTop: 6, textAlign: "center", border: "none", cursor: "pointer" }}>
                  {busy === "premium" ? "Loading…" : "Subscribe"}
                </button>
              </div>
              <div className="play-tier">
                <div style={{ fontSize: 12, opacity: 0.55, textTransform: "uppercase", letterSpacing: "0.12em" }}>vip</div>
                <div style={{ fontSize: 32, fontWeight: 800 }}>{PRICE_VIP}<span style={{ fontSize: 14, opacity: 0.5 }}>/mo</span></div>
                <ul style={{ margin: 0, paddingLeft: 16, lineHeight: 1.7, fontSize: 13, opacity: 0.85 }}>
                  <li>All premium</li>
                  <li>Diamond pickaxe</li>
                  <li>1 land plot reservation</li>
                  <li>VIP-only server</li>
                  <li>Discord VIP channel</li>
                  <li>Tournament invite priority</li>
                </ul>
                <button className="play-cta" disabled={busy !== null}
                  onClick={() => click("vip")}
                  style={{
                    marginTop: 6, textAlign: "center",
                    background: "rgba(255,255,255,0.08)", color: "#fff",
                    border: "1px solid rgba(255,255,255,0.12)", cursor: "pointer",
                  }}>
                  {busy === "vip" ? "Loading…" : "Subscribe"}
                </button>
              </div>
            </div>
            <div style={{ fontSize: 12, opacity: 0.45, marginTop: 12 }}>
              Cancel anytime. Stripe billing. No long-term commitment.
            </div>
          </section>

          {/* Tournaments */}
          <section style={{ marginBottom: 44 }}>
            <h2 style={{ fontSize: 13, opacity: 0.55, textTransform: "uppercase", letterSpacing: "0.16em", margin: "0 0 14px", fontWeight: 600 }}>tournaments</h2>
            <div className="play-tile" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ fontSize: 16, fontWeight: 700 }}>Hosted weekend events with cash prizes</div>
              <div style={{ fontSize: 13, opacity: 0.7, lineHeight: 1.6 }}>
                Periodic build contests, dig-race events, PvP tournaments. Run by the team
                with announced rules + payouts. VIP members get priority sign-up. Follow
                Discord and Telegram for the schedule.
              </div>
              <div style={{ display: "flex", gap: 10, marginTop: 6, flexWrap: "wrap" }}>
                <a className="play-cta" href="/b/glitchdgamba" style={{ background: "rgba(255,255,255,0.08)", color: "#fff", border: "1px solid rgba(255,255,255,0.12)" }}>Follow channels</a>
              </div>
            </div>
          </section>

          {/* Footer */}
          <footer style={{ fontSize: 11, opacity: 0.4, textAlign: "center", paddingTop: 36, lineHeight: 1.7 }}>
            <a href="/download" style={{ color: "rgba(255,255,255,0.55)", textDecoration: "none" }}>Download</a>
            <span style={{ margin: "0 8px" }}>·</span>
            <a href="/b/glitchdgamba" style={{ color: "rgba(255,255,255,0.55)", textDecoration: "none" }}>Channels</a>
            <div style={{ marginTop: 8 }}>Built on Luanti · open source · early access</div>
          </footer>
        </div>
      </div>
    </>
  );
}

function Feature({ title, body }: { title: string; body: string }) {
  return (
    <div className="play-tile">
      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>{title}</div>
      <div style={{ fontSize: 13, opacity: 0.7, lineHeight: 1.5 }}>{body}</div>
    </div>
  );
}
