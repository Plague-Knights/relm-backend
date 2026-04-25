"use client";

// Land buy page. Browses available plots by tier, mints a payment
// intent, shows the player exactly what to send and where, then polls
// the registry to confirm the SOL hit and the plot was assigned.

import { useEffect, useMemo, useState } from "react";

const API = process.env.NEXT_PUBLIC_RELM_BACKEND_URL || "";

type Tier = {
  id: 1 | 2 | 3;
  name: string;
  size: number;
  priceSol: string;
  perks: string[];
};

type Plot = {
  id: string;
  x: number;
  z: number;
  tier: number;
  size: number;
  status: "available" | "reserved" | "owned";
  ownerPlayer: string | null;
};

type Intent = {
  memo: string;
  paymentAddress: string;
  priceSol: string;
  expiresAt: string;
  plot: { id: string; x: number; z: number; tier: number; size: number };
};

export default function LandPage() {
  const [treasury, setTreasury] = useState<string | null>(null);
  const [tiers, setTiers] = useState<Tier[]>([]);
  const [activeTier, setActiveTier] = useState<1 | 2 | 3>(1);
  const [plots, setPlots] = useState<Plot[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // Intent flow
  const [player, setPlayer] = useState("");
  const [pending, setPending] = useState<Intent | null>(null);
  const [pendingErr, setPendingErr] = useState<string | null>(null);
  const [done, setDone] = useState<{ plotId: string } | null>(null);

  useEffect(() => {
    fetch(`${API}/api/land/tiers`)
      .then((r) => r.json())
      .then((j) => {
        setTreasury(j.treasury);
        setTiers(j.tiers ?? []);
      })
      .catch((e) => setErr((e as Error).message));
  }, []);

  useEffect(() => {
    setLoading(true);
    fetch(`${API}/api/land/available?tier=${activeTier}`)
      .then((r) => r.json())
      .then((j) => setPlots(j.plots ?? []))
      .catch((e) => setErr((e as Error).message))
      .finally(() => setLoading(false));
  }, [activeTier]);

  // Once we have a pending intent, poll the player's owned plots
  // every 5s. When the plot id we're waiting on shows up, mark done.
  useEffect(() => {
    if (!pending || !player) return;
    let stopped = false;
    const tick = async () => {
      if (stopped) return;
      try {
        const r = await fetch(`${API}/api/land/owned/${encodeURIComponent(player)}`);
        const j = await r.json();
        const owned = (j.plots ?? []) as Plot[];
        if (owned.find((p) => p.id === pending.plot.id)) {
          setDone({ plotId: pending.plot.id });
          setPending(null);
        }
      } catch { /* ignore transient */ }
    };
    const iv = setInterval(tick, 5000);
    tick();
    return () => { stopped = true; clearInterval(iv); };
  }, [pending, player]);

  async function buy(plotId: string) {
    if (!player.trim()) {
      setPendingErr("Enter your in-game player name first.");
      return;
    }
    setPendingErr(null);
    try {
      const r = await fetch(`${API}/api/land/intent`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ plotId, player: player.trim() }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j.error || `HTTP ${r.status}`);
      }
      const intent = (await r.json()) as Intent;
      setPending(intent);
    } catch (e) {
      setPendingErr((e as Error).message);
    }
  }

  const activeTierDef = useMemo(() => tiers.find((t) => t.id === activeTier), [tiers, activeTier]);

  if (done) {
    return (
      <div className="card">
        <h1 className="title">Plot claimed</h1>
        <p className="subtitle">
          Payment confirmed and the plot is yours. Hop in-game and run <code>/landinfo</code>
          standing on it to verify.
        </p>
        <button className="btn" onClick={() => { setDone(null); }}>Buy another</button>
      </div>
    );
  }

  if (pending) {
    return (
      <div className="card">
        <h1 className="title">Send payment</h1>
        <p className="subtitle">
          Send <b>exactly {pending.priceSol} SOL</b> to the address below from any Solana wallet,
          and include the memo so we can match the payment to your plot.
        </p>
        <div style={{ marginTop: 18 }}>
          <Field label="Amount">{pending.priceSol} SOL</Field>
          <Field label="Address">{pending.paymentAddress}</Field>
          <Field label="Memo">{pending.memo}</Field>
          <Field label="Expires">{new Date(pending.expiresAt).toLocaleString()}</Field>
        </div>
        <p className="subtitle" style={{ marginTop: 18 }}>
          This page will switch automatically when the payment lands. Don&rsquo;t close it.
        </p>
        {pendingErr && <p style={{ color: "salmon" }}>{pendingErr}</p>}
        <button
          className="btn"
          style={{ marginTop: 16, background: "transparent", border: "1px solid #555" }}
          onClick={() => { setPending(null); }}
        >
          Cancel
        </button>
      </div>
    );
  }

  return (
    <div className="card">
      <h1 className="title">Buy land · Relm</h1>
      <p className="subtitle">
        Three tiers. Paid in SOL straight to the project treasury — no
        bridge, no token swap. Pick a plot, send SOL with the memo we
        give you, and your in-game character gets dig/place rights on
        that area.
      </p>

      <div style={{ marginTop: 16 }}>
        <label style={{ display: "block", fontSize: 12, opacity: 0.6, marginBottom: 4 }}>
          In-game player name
        </label>
        <input
          value={player}
          onChange={(e) => setPlayer(e.target.value)}
          placeholder="exactly as it appears in chat"
          style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #333", background: "#111", color: "#eee" }}
        />
      </div>

      <div style={{ marginTop: 24, display: "flex", gap: 8 }}>
        {[1, 2, 3].map((t) => (
          <button
            key={t}
            onClick={() => setActiveTier(t as 1 | 2 | 3)}
            style={{
              flex: 1,
              padding: "10px 12px",
              borderRadius: 8,
              border: "1px solid " + (activeTier === t ? "#7c3aed" : "#333"),
              background: activeTier === t ? "#1f1240" : "transparent",
              color: "#eee",
              cursor: "pointer",
            }}
          >
            Tier {t}
          </button>
        ))}
      </div>

      {activeTierDef && (
        <div style={{ marginTop: 14, padding: 14, border: "1px solid #2a2a2a", borderRadius: 10 }}>
          <div style={{ fontWeight: 700 }}>{activeTierDef.name}</div>
          <div style={{ fontSize: 12, opacity: 0.6, marginTop: 2 }}>
            {activeTierDef.size}×{activeTierDef.size} blocks · <b>{activeTierDef.priceSol} SOL</b>
          </div>
          <ul style={{ marginTop: 8, fontSize: 13, paddingLeft: 18 }}>
            {activeTierDef.perks.map((p) => <li key={p}>{p}</li>)}
          </ul>
        </div>
      )}

      <h2 style={{ marginTop: 24, fontSize: 14, letterSpacing: ".1em", textTransform: "uppercase", opacity: 0.6 }}>
        Available · {plots.length}
      </h2>
      {err && <p style={{ color: "salmon" }}>{err}</p>}
      {loading && <p style={{ opacity: 0.6 }}>Loading…</p>}
      {!loading && plots.length === 0 && (
        <p style={{ opacity: 0.6 }}>No plots available in this tier — try another.</p>
      )}
      <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 8 }}>
        {plots.slice(0, 60).map((p) => (
          <div key={p.id} style={{ padding: 10, border: "1px solid #2a2a2a", borderRadius: 8 }}>
            <div style={{ fontFamily: "monospace", fontSize: 12 }}>({p.x}, {p.z})</div>
            <div style={{ fontSize: 12, opacity: 0.6 }}>{p.size}×{p.size}</div>
            <button className="btn" style={{ marginTop: 8, width: "100%", fontSize: 12 }} onClick={() => buy(p.id)}>
              Buy
            </button>
          </div>
        ))}
      </div>
      {pendingErr && <p style={{ color: "salmon", marginTop: 12 }}>{pendingErr}</p>}
      {treasury && (
        <p style={{ marginTop: 24, fontSize: 11, opacity: 0.4 }}>
          Treasury: <code>{treasury}</code>
        </p>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 11, letterSpacing: ".15em", textTransform: "uppercase", opacity: 0.5 }}>{label}</div>
      <div style={{ fontFamily: "monospace", fontSize: 13, marginTop: 2, wordBreak: "break-all" }}>{children}</div>
    </div>
  );
}
