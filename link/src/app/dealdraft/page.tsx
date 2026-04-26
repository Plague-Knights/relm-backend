// /dealdraft — explainer + CTA for the DealDraft casino aggregator.
// Linked from /b/glitchdgamba and from posts that don't have room for
// the full pitch.

export const metadata = {
  title: "DealDraft — compare every casino bonus",
  description: "Side-by-side casino welcome bonuses + rakeback. Updated daily. 18+.",
};

const CTA = "https://relm-server-production.up.railway.app/go/dealdraft?s=ddpage";

export default function DealDraftPage() {
  return (
    <div style={{
      minHeight: "100vh",
      background: "radial-gradient(circle at 50% -10%, #2a1426 0%, #0a0810 60%)",
      color: "#fff",
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, system-ui, sans-serif",
    }}>
      <div style={{ maxWidth: 880, margin: "0 auto", padding: "60px 24px 80px" }}>
        <div style={{ display: "inline-block", padding: "4px 12px", borderRadius: 999,
          background: "rgba(255,208,64,0.12)", border: "1px solid rgba(255,208,64,0.3)",
          color: "#ffd040", fontSize: 11, fontWeight: 700, letterSpacing: "0.1em",
          textTransform: "uppercase", marginBottom: 16 }}>★ featured partner</div>

        <h1 style={{ fontSize: 56, fontWeight: 800, letterSpacing: "-0.03em", margin: 0,
          lineHeight: 1.05,
          background: "linear-gradient(90deg, #fff 0%, #ffd040 70%, #ff8a3d 100%)",
          WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
          Compare every casino bonus before you deposit.
        </h1>
        <p style={{ fontSize: 18, lineHeight: 1.6, opacity: 0.7, marginTop: 18, maxWidth: 640 }}>
          DealDraft puts every welcome bonus, rakeback rate, withdrawal speed, and game
          library side-by-side. No hopping between casino sites, no missed promos,
          no buried fine print. Updated daily, sortable by what actually matters.
        </p>

        <div style={{ display: "flex", gap: 12, marginTop: 28, flexWrap: "wrap" }}>
          <a href={CTA} target="_blank" rel="noopener sponsored" style={{
            padding: "14px 26px", borderRadius: 10,
            background: "linear-gradient(135deg, #ffd040, #ff8a3d)",
            color: "#1a0a05", fontWeight: 700, fontSize: 16, textDecoration: "none",
          }}>Open DealDraft →</a>
        </div>

        <h2 style={{ fontSize: 13, opacity: 0.55, textTransform: "uppercase",
          letterSpacing: "0.16em", margin: "56px 0 14px", fontWeight: 600 }}>what you get</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
          <Tile title="Side-by-side comparison"
            body="Every active bonus, every casino, ranked by real value." />
          <Tile title="Rakeback + cashback"
            body="See actual returns, not headline percentages. We do the math." />
          <Tile title="Withdrawal speed"
            body="Average payout time per casino. No more 5-day wait surprises." />
          <Tile title="Reviewed daily"
            body="Bonus offers expire. We rotate the listings every 24h." />
          <Tile title="Verified payouts"
            body="Streamer reviews + community-flagged delays surface fast." />
          <Tile title="No-fluff filters"
            body="Filter by crypto-native, sportsbook, slots-first, sweepstakes." />
        </div>

        <h2 style={{ fontSize: 13, opacity: 0.55, textTransform: "uppercase",
          letterSpacing: "0.16em", margin: "44px 0 14px", fontWeight: 600 }}>how it works</h2>
        <ol style={{ paddingLeft: 22, lineHeight: 1.8, opacity: 0.85 }}>
          <li>Open <a href={CTA} target="_blank" rel="noopener sponsored" style={{ color: "#ffd040" }}>DealDraft</a> — no account needed to browse.</li>
          <li>Filter by what matters to you: bonus size, crypto support, your state.</li>
          <li>Click into a casino — full breakdown of bonus terms, payout speed, rakeback rate.</li>
          <li>Sign up via the DealDraft link to lock in the listed bonus.</li>
          <li>Track payouts and report delays from your dashboard.</li>
        </ol>

        <div style={{
          marginTop: 44,
          padding: 22,
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,208,64,0.3)",
          borderRadius: 14,
          fontSize: 14, lineHeight: 1.6,
        }}>
          <div style={{ color: "#ffd040", fontWeight: 700, marginBottom: 6 }}>Why I'm featuring DealDraft</div>
          <div style={{ opacity: 0.85 }}>
            I look at casino offers all day. The reason this is the only partner with a
            FEATURED slot in my bio is simple — it's the only site that actually
            shows you the bonus you'll receive vs. the bonus you were promised.
            Withdrawal-speed data is a game-changer.
          </div>
        </div>

        <footer style={{ fontSize: 11, opacity: 0.4, textAlign: "center",
          marginTop: 50, lineHeight: 1.7 }}>
          18+ only · gamble responsibly · begambleaware.org · 1-800-GAMBLER<br />
          <a href="/b/glitchdgamba" style={{ color: "rgba(255,255,255,0.55)", textDecoration: "none" }}>← back to @glitchdgamba</a>
        </footer>
      </div>
    </div>
  );
}

function Tile({ title, body }: { title: string; body: string }) {
  return (
    <div style={{
      background: "rgba(255,255,255,0.04)",
      border: "1px solid rgba(255,255,255,0.08)",
      borderRadius: 14, padding: 16,
    }}>
      <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>{title}</div>
      <div style={{ fontSize: 12, opacity: 0.65, lineHeight: 1.5 }}>{body}</div>
    </div>
  );
}
