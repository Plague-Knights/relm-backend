"use client";

import { useEffect, useMemo, useState } from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAccount, useChainId, useSwitchChain, useWriteContract, useWaitForTransactionReceipt, useReadContract } from "wagmi";
import { formatEther } from "viem";
import { soneiumMinato } from "@/config/chains";
import { RELM_REFILL_ADDRESS, RELM_REFILL_ABI, RELM_TOKEN_ADDRESS, RELM_TOKEN_ABI } from "@/config/contracts";

type EnergyState = {
  player: string;
  current: number;
  max: number;
  regenPerMin: number;
  lastRegenAt: string;
};

export default function RefillPage({ searchParams }: { searchParams: Promise<{ player?: string }> }) {
  const [player, setPlayer] = useState("");
  const [energy, setEnergy] = useState<EnergyState | null>(null);
  const [pollKey, setPollKey] = useState(0);
  const [phase, setPhase] = useState<"idle" | "approving" | "refilling" | "done" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    searchParams.then((p) => { if (p.player) setPlayer(p.player); });
  }, [searchParams]);

  useEffect(() => {
    if (!player) return;
    let cancelled = false;
    const load = () => fetch(`/api/energy/${encodeURIComponent(player)}`)
      .then(r => r.ok ? r.json() : Promise.reject(`status ${r.status}`))
      .then(d => { if (!cancelled) setEnergy(d); })
      .catch(e => { if (!cancelled) setErrorMsg(String(e)); });
    load();
    const id = setInterval(load, 4000);
    return () => { cancelled = true; clearInterval(id); };
  }, [player, pollKey]);

  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChain, isPending: switching } = useSwitchChain();
  const { writeContract, data: txHash, error: writeErr, isPending: writing, reset } = useWriteContract();
  const { isLoading: confirming, isSuccess: confirmed } = useWaitForTransactionReceipt({ hash: txHash });

  const wrongChain = isConnected && chainId !== soneiumMinato.id;

  const { data: refillPrice } = useReadContract({
    address: RELM_REFILL_ADDRESS,
    abi: RELM_REFILL_ABI,
    functionName: "refillPrice",
  });
  const { data: refillAmount } = useReadContract({
    address: RELM_REFILL_ADDRESS,
    abi: RELM_REFILL_ABI,
    functionName: "refillAmount",
  });
  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: RELM_TOKEN_ADDRESS,
    abi: RELM_TOKEN_ABI,
    functionName: "allowance",
    args: address ? [address, RELM_REFILL_ADDRESS] : undefined,
    query: { enabled: !!address },
  });
  const { data: relmBalance } = useReadContract({
    address: RELM_TOKEN_ADDRESS,
    abi: RELM_TOKEN_ABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });

  useEffect(() => {
    if (confirmed) {
      reset();
      refetchAllowance();
      if (phase === "approving") {
        // Approve confirmed; immediately fire the refill itself.
        setPhase("refilling");
        writeContract({
          address: RELM_REFILL_ADDRESS,
          abi: RELM_REFILL_ABI,
          functionName: "refill",
          args: [],
        });
      } else if (phase === "refilling") {
        setPhase("done");
        // Backend has ~15s to pick up the event; poll faster for a moment.
        setTimeout(() => setPollKey(k => k + 1), 5000);
        setTimeout(() => setPollKey(k => k + 1), 12000);
        setTimeout(() => setPollKey(k => k + 1), 20000);
      }
    }
  }, [confirmed, phase, reset, refetchAllowance, writeContract]);

  function start() {
    if (!refillPrice) return;
    setErrorMsg(null);
    if ((allowance as bigint | undefined ?? 0n) < (refillPrice as bigint)) {
      setPhase("approving");
      writeContract({
        address: RELM_TOKEN_ADDRESS,
        abi: RELM_TOKEN_ABI,
        functionName: "approve",
        args: [RELM_REFILL_ADDRESS, refillPrice as bigint],
      });
    } else {
      setPhase("refilling");
      writeContract({
        address: RELM_REFILL_ADDRESS,
        abi: RELM_REFILL_ABI,
        functionName: "refill",
        args: [],
      });
    }
  }

  const status = useMemo(() => {
    if (writeErr) return { msg: writeErr.message, err: true };
    if (writing) return { msg: "Confirm in wallet…", err: false };
    if (confirming) return { msg: phase === "approving" ? "Approving RELM…" : "Refilling…", err: false };
    if (phase === "done") return { msg: "Refill confirmed on-chain. Energy update lands shortly.", err: false };
    return null;
  }, [writeErr, writing, confirming, phase]);

  const energyPct = energy ? Math.round((energy.current / energy.max) * 100) : 0;

  if (!player) {
    return (
      <div className="card">
        <h1 className="title">Missing player</h1>
        <p className="subtitle">Open this page from the URL <code>/energy</code> prints in Relm. It needs <code>?player=…</code>.</p>
      </div>
    );
  }

  return (
    <div className="card" style={{ maxWidth: 480 }}>
      <h1 className="title">Energy · {player}</h1>
      <p className="subtitle">
        Energy gates RELM rewards: every action consumes 1 point, regenerates {energy?.regenPerMin ?? "—"}/min idle. Pay RELM here to refill instantly.
      </p>

      <div className="row">
        <span className="label">Current</span>
        <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid var(--border)", borderRadius: 10, padding: 4, marginTop: 4 }}>
          <div style={{
            width: `${energyPct}%`,
            background: energyPct === 0 ? "#ff7474" : "var(--accent)",
            color: "#071016",
            padding: "8px 12px",
            borderRadius: 7,
            fontWeight: 700,
            fontSize: 13,
            transition: "width 0.4s ease",
            minWidth: 60,
          }}>
            {energy ? `${energy.current} / ${energy.max}` : "…"}
          </div>
        </div>
      </div>

      <div className="row">
        <ConnectButton chainStatus="icon" />
      </div>

      {wrongChain && (
        <div className="row">
          <button className="btn" onClick={() => switchChain({ chainId: soneiumMinato.id })} disabled={switching}>
            {switching ? "Switching…" : "Switch to Soneium Minato"}
          </button>
        </div>
      )}

      {refillPrice != null && refillAmount != null && (
        <div className="row">
          <div className="subtitle" style={{ margin: "0 0 6px" }}>
            Refill <b>{Number(refillAmount as bigint)}</b> energy for{" "}
            <b>{Math.round(Number(formatEther(refillPrice as bigint)))}</b> RELM
          </div>
          {relmBalance != null && (
            <div className="mono" style={{ fontSize: 12, opacity: 0.7 }}>
              wallet: {Math.round(Number(formatEther(relmBalance as bigint)))} RELM
            </div>
          )}
          <button
            className="btn"
            style={{ marginTop: 10 }}
            onClick={start}
            disabled={!isConnected || wrongChain || writing || confirming || (relmBalance as bigint | undefined ?? 0n) < (refillPrice as bigint)}
          >
            Refill
          </button>
        </div>
      )}

      {status && (
        <div className="row" style={{ color: status.err ? "#ff7474" : "var(--accent)" }}>
          {status.msg}
        </div>
      )}
      {errorMsg && <div className="row status-err">Error: {errorMsg}</div>}
    </div>
  );
}
