// /download — single-click download landing for the RELM Windows
// client. Cross-promote with /play. The actual zip is hosted under
// /downloads/ — for v1 we serve the Luanti portable bundle + our
// fighter_pose mod + a launcher.bat that points at the Railway
// backend.

export const metadata = {
  title: "RELM — download",
  description: "Download the RELM mining client for Windows.",
};

export default function DownloadPage() {
  return (
    <div style={{
      minHeight: "100vh",
      background: "radial-gradient(circle at 50% 0%, #281121 0%, #0a0810 60%)",
      color: "#fff",
      padding: "60px 24px",
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, system-ui, sans-serif",
    }}>
      <div style={{ maxWidth: 640, margin: "0 auto" }}>
        <h1 style={{
          fontSize: 38, fontWeight: 800, letterSpacing: "-0.03em",
          margin: 0, marginBottom: 14,
          background: "linear-gradient(90deg, #fff 0%, #ffd040 70%, #ff8a3d 100%)",
          WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
        }}>Download RELM</h1>
        <p style={{ opacity: 0.7, fontSize: 15, lineHeight: 1.6 }}>
          Single-zip Windows portable. No installer required. Unzip and run
          <code style={{
            background: "rgba(255,255,255,0.1)", padding: "2px 6px",
            borderRadius: 4, marginLeft: 6, fontSize: 13,
          }}>RELM.bat</code>.
        </p>

        <div style={{ marginTop: 30, display: "flex", flexDirection: "column", gap: 12 }}>
          <DownloadTile
            label="Windows (x64)"
            sub="~50 MB · portable zip · v0.1.0"
            href="/downloads/RELM-win64-v0.1.0.zip"
            primary
          />
          <DownloadTile
            label="Windows (debug build)"
            sub="extra logging, slower"
            href="/downloads/RELM-win64-debug-v0.1.0.zip"
          />
          <div style={{
            padding: 14, marginTop: 8,
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 12, fontSize: 13, lineHeight: 1.6,
          }}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>after install:</div>
            <ol style={{ margin: 0, paddingLeft: 20, opacity: 0.85 }}>
              <li>unzip → run <code style={{ background: "rgba(255,255,255,0.12)", padding: "1px 4px", borderRadius: 3 }}>RELM.bat</code></li>
              <li>in chat type <code style={{ background: "rgba(255,255,255,0.12)", padding: "1px 4px", borderRadius: 3 }}>/wallet 0x…</code> with your Soneium address</li>
              <li>find diamond → win RELM. break stone → earn RELM.</li>
              <li><code style={{ background: "rgba(255,255,255,0.12)", padding: "1px 4px", borderRadius: 3 }}>/balance</code> + <code style={{ background: "rgba(255,255,255,0.12)", padding: "1px 4px", borderRadius: 3 }}>/upgrade</code> to spend it.</li>
            </ol>
          </div>
        </div>

        <div style={{ marginTop: 36, fontSize: 12, opacity: 0.45, textAlign: "center" }}>
          Built on <a href="https://www.luanti.org" target="_blank" rel="noopener" style={{ color: "rgba(255,255,255,0.6)" }}>Luanti</a> · open source ·
          <a href="/play" style={{ marginLeft: 6, color: "rgba(255,255,255,0.6)" }}>back to play</a>
        </div>
      </div>
    </div>
  );
}

function DownloadTile({ label, sub, href, primary }: { label: string; sub: string; href: string; primary?: boolean }) {
  return (
    <a href={href} style={{
      display: "flex", alignItems: "center", gap: 14,
      padding: "16px 18px",
      background: primary ? "linear-gradient(135deg, #ffd040, #ff8a3d)" : "rgba(255,255,255,0.04)",
      color: primary ? "#1a0a05" : "#fff",
      border: primary ? "none" : "1px solid rgba(255,255,255,0.08)",
      borderRadius: 14,
      textDecoration: "none",
      transition: "transform 120ms",
    }}>
      <div style={{
        width: 44, height: 44, borderRadius: 10,
        background: primary ? "rgba(0,0,0,0.15)" : "rgba(255,208,64,0.15)",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 22,
      }}>⬇</div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 15, fontWeight: 700 }}>{label}</div>
        <div style={{ fontSize: 12, opacity: primary ? 0.7 : 0.55, marginTop: 2 }}>{sub}</div>
      </div>
    </a>
  );
}
