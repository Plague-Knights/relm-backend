"use client";

// Arena — pari-mutuel betting on AI fighter rounds. Players don't
// fight; they pick which NPC takes the win and stake RELM. Outcomes
// are deterministic from a committed seed revealed at lock time, so
// every round is auditable from /api/arena/verify/:id.

import { useEffect, useMemo, useState } from "react";

const API = process.env.NEXT_PUBLIC_RELM_BACKEND_URL || "";

type Fighter = { id: string; name: string; power: number; speed: number; luck: number };

type Bet = {
  id: string;
  player: string;
  fighterIdx: number;
  amountBps: number;
  payoutBps: number;
  settled: boolean;
};

type Round = {
  id: string;
  status: "OPEN" | "LOCKED" | "SETTLED";
  seedCommit: string;
  seedReveal: string | null;
  fighters: Fighter[];
  winnerIdx: number | null;
  totalPoolBps: number;
  houseBps: number;
  bettingClosesAt: string;
  settledAt: string | null;
  createdAt: string;
  bets?: Bet[];
};

const fmtRelm = (bps: number) => (bps / 10_000).toFixed(4);

export default function ArenaPage() {
  const [player, setPlayer] = useState("");
  const [open, setOpen] = useState<Round | null>(null);
  const [lastSettled, setLastSettled] = useState<Round | null>(null);
  const [balanceBps, setBalanceBps] = useState<number | null>(null);
  const [pendingFighterIdx, setPendingFighterIdx] = useState<number | null>(null);
  const [betInput, setBetInput] = useState("1.0");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Refresh state every 3s. Tight enough that the betting countdown
  // feels live + the lock-and-reveal transition is visible.
  useEffect(() => {
    let stopped = false;
    const tick = async () => {
      if (stopped) return;
      try {
        const params = player ? `?player=${encodeURIComponent(player)}` : "";
        const res = await fetch(`${API}/api/arena/current${params}`, { cache: "no-store" });
        const j = await res.json();
        setOpen(j.open ?? null);
        setLastSettled(j.lastSettled ?? null);
        if (typeof j.balanceBps === "number") setBalanceBps(j.balanceBps);
      } catch { /* noop */ }
    };
    tick();
    const iv = setInterval(tick, 3000);
    return () => { stopped = true; clearInterval(iv); };
  }, [player]);

  async function placeBet(fighterIdx: number) {
    if (!open || !player.trim()) {
      setErr("Enter your player name first.");
      return;
    }
    const amount = Math.round(parseFloat(betInput) * 10_000);
    if (!Number.isFinite(amount) || amount <= 0) {
      setErr("Bet must be > 0 RELM.");
      return;
    }
    setBusy(true);
    setErr(null);
    setPendingFighterIdx(fighterIdx);
    try {
      const r = await fetch(`${API}/api/arena/bet`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          roundId: open.id,
          player: player.trim(),
          fighterIdx,
          amountBps: amount,
        }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j.error || `HTTP ${r.status}`);
      }
      const j = await r.json();
      if (typeof j.balanceBps === "number") setBalanceBps(j.balanceBps);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
      setPendingFighterIdx(null);
    }
  }

  const countdown = useMemo(() => {
    if (!open) return null;
    const target = Date.parse(open.bettingClosesAt);
    return Math.max(0, target - Date.now());
  }, [open]);

  // Tick the countdown display every second (driven by useState
  // so React re-renders).
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(iv);
  }, []);
  const liveCountdown = useMemo(() => {
    if (!open) return null;
    return Math.max(0, Date.parse(open.bettingClosesAt) - now);
  }, [open, now]);

  return (
    <div className="card" style={{ maxWidth: 720 }}>
      <h1 className="title">Relm · Arena</h1>
      <p className="subtitle">
        Pick the fighter you think wins. Pari-mutuel: house takes 5%,
        winners split the rest pro-rata. Outcomes are committed-and-revealed
        — every round is verifiable.
      </p>

      <div style={{ marginTop: 18 }}>
        <label style={{ display: "block", fontSize: 11, opacity: 0.55, marginBottom: 4 }}>
          In-game player name
        </label>
        <input
          value={player}
          onChange={(e) => setPlayer(e.target.value)}
          placeholder="exactly as it appears in chat"
          style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #333", background: "#111", color: "#eee" }}
        />
        {balanceBps !== null && (
          <div style={{ marginTop: 8, fontSize: 13 }}>
            Balance: <b style={{ fontFamily: "monospace" }}>{fmtRelm(balanceBps)} RELM</b>
          </div>
        )}
      </div>

      {open ? (
        <RoundCard
          round={open}
          countdownMs={liveCountdown ?? countdown ?? 0}
          onBet={placeBet}
          pendingFighterIdx={pendingFighterIdx}
          busy={busy}
          betInput={betInput}
          setBetInput={setBetInput}
        />
      ) : (
        <p style={{ marginTop: 24, opacity: 0.6 }}>
          Waiting for the next round to open…
        </p>
      )}

      {err && <p style={{ color: "salmon", marginTop: 12 }}>{err}</p>}

      {lastSettled && (
        <div style={{ marginTop: 28, padding: 14, border: "1px solid #2a2a2a", borderRadius: 10 }}>
          <div style={{ fontSize: 11, letterSpacing: ".15em", textTransform: "uppercase", opacity: 0.5, marginBottom: 8 }}>
            Last round
          </div>
          {lastSettled.winnerIdx != null && (
            <div style={{ fontSize: 14 }}>
              Winner: <b>{lastSettled.fighters[lastSettled.winnerIdx]?.name}</b>
              {" · "}Pool: {fmtRelm(lastSettled.totalPoolBps)} RELM
              {" · "}House: {fmtRelm(lastSettled.houseBps)} RELM
            </div>
          )}
          <a
            href={`${API}/api/arena/verify/${lastSettled.id}`}
            target="_blank"
            rel="noreferrer"
            style={{ marginTop: 8, display: "inline-block", fontSize: 11, opacity: 0.6 }}
          >
            Verify round →
          </a>
        </div>
      )}
    </div>
  );
}

function RoundCard({
  round,
  countdownMs,
  onBet,
  pendingFighterIdx,
  busy,
  betInput,
  setBetInput,
}: {
  round: Round;
  countdownMs: number;
  onBet: (idx: number) => void;
  pendingFighterIdx: number | null;
  busy: boolean;
  betInput: string;
  setBetInput: (v: string) => void;
}) {
  const isOpen = round.status === "OPEN";
  const winnerIdx = round.winnerIdx;
  const m = Math.floor(countdownMs / 60_000);
  const s = Math.floor((countdownMs % 60_000) / 1000);

  return (
    <div style={{ marginTop: 24 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <div style={{ fontSize: 11, opacity: 0.55, letterSpacing: ".15em", textTransform: "uppercase" }}>
          Round · {round.status}
        </div>
        {isOpen && (
          <div style={{ fontFamily: "monospace", fontSize: 13, color: "#7c3aed" }}>
            {m}:{s.toString().padStart(2, "0")}
          </div>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 8 }}>
        {round.fighters.map((f, i) => {
          const isWinner = winnerIdx === i;
          const isLoser = winnerIdx != null && winnerIdx !== i;
          return (
            <div
              key={f.id}
              style={{
                padding: 12,
                border: "1px solid " + (isWinner ? "#22c55e" : isLoser ? "#333" : "#2a2a2a"),
                borderRadius: 10,
                background: isWinner ? "#0a2e1a" : "transparent",
                opacity: isLoser ? 0.5 : 1,
                transition: "all 0.3s",
              }}
            >
              <div style={{ fontWeight: 700, fontSize: 14 }}>{f.name}</div>
              <div style={{ fontSize: 11, opacity: 0.6, marginTop: 2 }}>
                PWR {f.power} · SPD {f.speed} · LCK {f.luck}
              </div>
              {isOpen && (
                <button
                  className="btn"
                  disabled={busy && pendingFighterIdx !== i}
                  onClick={() => onBet(i)}
                  style={{ marginTop: 8, width: "100%", fontSize: 12 }}
                >
                  {busy && pendingFighterIdx === i ? "Placing…" : "Bet"}
                </button>
              )}
              {isWinner && (
                <div style={{ marginTop: 8, fontSize: 11, color: "#7fff9b", fontWeight: 700 }}>
                  WINNER
                </div>
              )}
            </div>
          );
        })}
      </div>

      {isOpen && (
        <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 8 }}>
          <label style={{ fontSize: 11, opacity: 0.55 }}>Bet amount (RELM):</label>
          <input
            type="number"
            min="0.0001"
            step="0.1"
            value={betInput}
            onChange={(e) => setBetInput(e.target.value)}
            style={{ flex: 1, padding: "6px 10px", borderRadius: 6, border: "1px solid #333", background: "#111", color: "#eee" }}
          />
        </div>
      )}

      <div style={{ marginTop: 14, fontSize: 11, opacity: 0.4, fontFamily: "monospace", wordBreak: "break-all" }}>
        commit: {round.seedCommit.slice(0, 16)}…
        {round.seedReveal && (
          <>  ·  seed: {round.seedReveal.slice(0, 16)}…</>
        )}
      </div>
    </div>
  );
}
