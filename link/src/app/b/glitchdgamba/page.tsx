// /b/glitchdgamba — link-in-bio aggregator. Designed mobile-first
// because 95% of IG profile-link traffic is mobile. The page shouldn't
// feel like a Linktree clone — it should feel like a brand landing.
//
// Visual rules:
//   * single column, ~420px max width on desktop, full-bleed on mobile
//   * animated gradient background that hints at the brand colors
//   * avatar with a soft glow halo so it pops
//   * tiles with thin colored left bar + arrow on right, big tap target
//   * 18+ disclaimer is non-negotiable (responsible gaming)

import { Metadata } from "next";

export const metadata: Metadata = {
  title: "GlitchdGamba — links",
  description: "Casino, sportsbook, crypto. Daily clips. 18+ only.",
  openGraph: {
    title: "GlitchdGamba",
    description: "Casino · sportsbook · crypto · daily clips.",
    type: "website",
  },
};

type Tile = {
  title: string;
  subtitle: string;
  url: string;
  accent: string;
  badge?: string;
};

const PARTNER_TILES: Tile[] = [
  {
    title: "DealDraft",
    subtitle: "Best casino bonuses, side-by-side. The deal aggregator.",
    url: "https://relm-server-production.up.railway.app/go/dealdraft?s=bio",
    accent: "#ffd040",
    badge: "FEATURED",
  },
  {
    title: "Gambulls Casino",
    subtitle: "Crypto casino · slots · live dealer",
    url: "https://relm-server-production.up.railway.app/go/gambulls?s=bio",
    accent: "#ff8a3d",
    badge: "PARTNER",
  },
];

const FOLLOW_TILES: Tile[] = [
  {
    title: "Instagram",
    subtitle: "@glitchdgamba",
    url: "https://instagram.com/glitchdgamba",
    accent: "#e1306c",
  },
  {
    title: "TikTok",
    subtitle: "@glitchdgamba",
    url: "https://tiktok.com/@glitchdgamba",
    accent: "#69c9d0",
  },
  {
    title: "Telegram News",
    subtitle: "Daily gambling · sports · crypto news",
    url: "https://t.me/+__YOUR_PUBLIC_INVITE__",
    accent: "#229ed9",
  },
];

export default function GlitchdGambaBio() {
  return (
    <>
      <style>{`
        @keyframes bgshift {
          0%   { background-position:   0% 50%; }
          50%  { background-position: 100% 50%; }
          100% { background-position:   0% 50%; }
        }
        @keyframes haloPulse {
          0%, 100% { box-shadow: 0 0 80px rgba(255, 138, 61, 0.45), 0 0 0 0 rgba(255, 208, 64, 0.3); }
          50%      { box-shadow: 0 0 100px rgba(255, 208, 64, 0.55), 0 0 0 14px rgba(255, 208, 64, 0); }
        }
        .gg-bg {
          background: radial-gradient(circle at 50% -10%, #2c1428 0%, #0a0810 55%),
                      linear-gradient(135deg, #1a0d24 0%, #281019 50%, #1d1129 100%);
          background-size: 100% 100%, 200% 200%;
          animation: bgshift 18s ease infinite;
        }
        .gg-tile {
          transition: transform 140ms ease, background 140ms ease, border-color 140ms ease;
        }
        .gg-tile:hover, .gg-tile:focus-visible {
          background: rgba(255, 255, 255, 0.075) !important;
          border-color: rgba(255, 208, 64, 0.35) !important;
          transform: translateY(-2px);
          outline: none;
        }
        .gg-avatar {
          animation: haloPulse 3.5s ease-in-out infinite;
        }
      `}</style>

      <div className="gg-bg" style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "flex-start",
        padding: "44px 20px 60px",
        color: "#fff",
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, system-ui, sans-serif",
      }}>
        <div style={{ width: "100%", maxWidth: 460 }}>
          {/* Header */}
          <header style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: 36 }}>
            <div className="gg-avatar" style={{
              width: 112, height: 112, borderRadius: "50%",
              background: "radial-gradient(circle at 30% 30%, #ffd040, #ff8a3d 60%, #e85a25 100%)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 44, fontWeight: 900, color: "#1a0a05",
              letterSpacing: "-0.02em",
              border: "3px solid rgba(255, 220, 120, 0.5)",
            }}>GG</div>
            <h1 style={{ fontSize: 26, fontWeight: 800, marginTop: 18, letterSpacing: "-0.02em" }}>
              GlitchdGamba
            </h1>
            <div style={{ fontSize: 13, opacity: 0.65, marginTop: 4, letterSpacing: "0.02em" }}>
              casino · sportsbook · crypto · daily clips
            </div>
            <div style={{
              marginTop: 12, padding: "4px 12px", borderRadius: 999,
              background: "rgba(255, 208, 64, 0.12)",
              border: "1px solid rgba(255, 208, 64, 0.3)",
              color: "#ffd040",
              fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase",
            }}>● live</div>
          </header>

          {/* Partners */}
          <SectionLabel>partners</SectionLabel>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 36 }}>
            {PARTNER_TILES.map((t) => <BioTile key={t.title} t={t} />)}
          </div>

          {/* Socials */}
          <SectionLabel>follow</SectionLabel>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {FOLLOW_TILES.map((t) => <BioTile key={t.title} t={t} />)}
          </div>

          {/* Footer */}
          <footer style={{
            fontSize: 11, opacity: 0.42, textAlign: "center",
            marginTop: 48, lineHeight: 1.7, letterSpacing: "0.02em",
          }}>
            <div style={{ marginBottom: 6 }}>18+ only · gamble responsibly</div>
            <a href="https://www.begambleaware.org" target="_blank" rel="noopener noreferrer"
               style={{ color: "rgba(255,255,255,0.55)", textDecoration: "none" }}>
              begambleaware.org
            </a>
            <span style={{ margin: "0 8px" }}>·</span>
            <span>1-800-GAMBLER</span>
          </footer>
        </div>
      </div>
    </>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 11,
      opacity: 0.5,
      textTransform: "uppercase",
      letterSpacing: "0.16em",
      marginBottom: 10,
      paddingLeft: 4,
      fontWeight: 600,
    }}>{children}</div>
  );
}

function BioTile({ t }: { t: Tile }) {
  return (
    <a
      href={t.url}
      target="_blank"
      rel="noopener noreferrer sponsored"
      className="gg-tile"
      style={{
        display: "block",
        textDecoration: "none",
        color: "#fff",
        background: "rgba(255, 255, 255, 0.04)",
        border: "1px solid rgba(255, 255, 255, 0.08)",
        borderRadius: 16,
        padding: "16px 18px",
        position: "relative",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <div style={{
          width: 6, height: 44, borderRadius: 3, background: t.accent,
          boxShadow: `0 0 12px ${t.accent}66`,
        }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{
              fontWeight: 700, fontSize: 15.5, letterSpacing: "-0.01em",
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>{t.title}</div>
            {t.badge && (
              <span style={{
                fontSize: 9, fontWeight: 700, letterSpacing: "0.1em",
                padding: "2px 6px", borderRadius: 4,
                background: "rgba(255, 208, 64, 0.18)",
                color: "#ffd040", textTransform: "uppercase",
              }}>{t.badge}</span>
            )}
          </div>
          <div style={{
            fontSize: 12, opacity: 0.65, marginTop: 3,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>{t.subtitle}</div>
        </div>
        <div style={{ fontSize: 18, opacity: 0.4, marginLeft: 4 }}>→</div>
      </div>
    </a>
  );
}
