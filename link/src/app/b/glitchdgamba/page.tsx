// /b/glitchdgamba — link-in-bio aggregator. IG only allows one URL in
// the profile, so all our IG/TikTok captions point here ("link in bio")
// and this page lists every active partner ref + content channel.
//
// Click tracking is server-side: each /go/<key> redirect logs the
// referer, niche, and timestamp so we can split-test which partners
// + content niches actually convert.

export const metadata = {
  title: "GlitchdGamba — links",
  description: "Casino, sportsbook, and crypto refs. Gamble responsibly.",
};

type Tile = {
  title: string;
  subtitle: string;
  url: string;
  accent: string;
};

const TILES: Tile[] = [
  {
    title: "Gambulls Casino",
    subtitle: "Crypto casino · slots · live dealer",
    url: "https://relm-server-production.up.railway.app/go/gambulls?s=bio",
    accent: "#ff8a3d",
  },
  // Add more partners here as deals close.
];

const SOCIAL: Tile[] = [
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
    <div style={{
      minHeight: "100vh",
      display: "flex", flexDirection: "column", alignItems: "center",
      padding: "48px 24px",
      background: "radial-gradient(circle at top, #1d1129 0%, #0a0810 60%)",
      color: "#fff",
    }}>
      <div style={{ width: "100%", maxWidth: 480 }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: 32 }}>
          <div style={{
            width: 96, height: 96, borderRadius: "50%",
            background: "linear-gradient(135deg, #ffd040, #ff8a3d)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 38, fontWeight: 800, color: "#1a0d0d",
            boxShadow: "0 6px 30px rgba(255, 138, 61, 0.4)",
          }}>GG</div>
          <div style={{ fontSize: 22, fontWeight: 700, marginTop: 14 }}>GlitchdGamba</div>
          <div style={{ fontSize: 13, opacity: 0.7, marginTop: 4 }}>
            casino · sportsbook · crypto · daily clips
          </div>
        </div>

        <div style={{ fontSize: 12, opacity: 0.55, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8 }}>partners</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 32 }}>
          {TILES.map((t) => <BioTile key={t.title} t={t} />)}
        </div>

        <div style={{ fontSize: 12, opacity: 0.55, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8 }}>follow</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {SOCIAL.map((t) => <BioTile key={t.title} t={t} />)}
        </div>

        <div style={{ fontSize: 11, opacity: 0.4, textAlign: "center", marginTop: 40, lineHeight: 1.6 }}>
          18+ only. Gambling can be addictive — please gamble responsibly.
          <br />Begambleaware.org · 1-800-GAMBLER
        </div>
      </div>
    </div>
  );
}

function BioTile({ t }: { t: Tile }) {
  return (
    <a
      href={t.url}
      target="_blank"
      rel="noopener noreferrer sponsored"
      style={{
        display: "block",
        textDecoration: "none",
        color: "#fff",
        background: "rgba(255,255,255,0.05)",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 14,
        padding: "16px 18px",
        transition: "transform 120ms, background 120ms",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{
          width: 8, height: 40, borderRadius: 4, background: t.accent,
        }} />
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>{t.title}</div>
          <div style={{ fontSize: 12, opacity: 0.7, marginTop: 2 }}>{t.subtitle}</div>
        </div>
        <div style={{ fontSize: 18, opacity: 0.5 }}>→</div>
      </div>
    </a>
  );
}
