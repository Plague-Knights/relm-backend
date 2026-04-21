"use client";

import { useEffect, useMemo, useState } from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAccount, useSignMessage, useChainId, useSwitchChain } from "wagmi";
import { soneiumMinato } from "@/config/chains";

type Challenge = {
  url: string;
  nonce: string;
  message: string;
  expiresAt: string;
};

type Phase = "idle" | "loading" | "ready" | "signing" | "confirming" | "done" | "error";

export default function LinkPage({ searchParams }: { searchParams: Promise<{ player?: string; nonce?: string }> }) {
  const [player, setPlayer] = useState<string>("");
  const [nonceHint, setNonceHint] = useState<string>("");
  useEffect(() => {
    searchParams.then((p) => {
      if (p.player) setPlayer(p.player);
      if (p.nonce) setNonceHint(p.nonce);
    });
  }, [searchParams]);

  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [confirmToken, setConfirmToken] = useState<string | null>(null);

  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChain, isPending: switching } = useSwitchChain();
  const { signMessageAsync } = useSignMessage();

  const wrongChain = isConnected && chainId !== soneiumMinato.id;

  // Adjust the canonical SIWE message so it binds the actual connected
  // address (the server issued the challenge with a zero-address
  // placeholder since it didn't know the wallet yet).
  const bindMessage = useMemo(() => {
    if (!challenge || !address) return null;
    return challenge.message.replace(
      /0x0000000000000000000000000000000000000000/,
      address
    );
  }, [challenge, address]);

  async function fetchChallenge() {
    setPhase("loading");
    setError(null);
    try {
      const res = await fetch("/api/wallet/challenge", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ player }),
      });
      if (!res.ok) throw new Error(`challenge: ${res.status}`);
      const body: Challenge = await res.json();
      setChallenge(body);
      setPhase("ready");
    } catch (e) {
      setError((e as Error).message);
      setPhase("error");
    }
  }

  async function signAndConfirm() {
    if (!bindMessage || !address || !challenge) return;
    setPhase("signing");
    try {
      const signature = await signMessageAsync({ message: bindMessage });
      setPhase("confirming");
      const res = await fetch("/api/wallet/confirm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          player,
          address,
          token: challenge.nonce,
          message: bindMessage,
          signature,
        }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`confirm ${res.status}: ${text}`);
      }
      setConfirmToken(challenge.nonce);
      setPhase("done");
    } catch (e) {
      setError((e as Error).message);
      setPhase("error");
    }
  }

  if (!player) {
    return (
      <div className="card">
        <h1 className="title">Missing player</h1>
        <p className="subtitle">
          Open this page from the URL <code>/wallet-link</code> printed in Relm.
          It needs to include a <code>?player=...</code> query param.
        </p>
      </div>
    );
  }

  return (
    <div className="card">
      <h1 className="title">Link wallet → {player}</h1>
      <p className="subtitle">
        Sign a one-time message to bind this Soneium wallet to your Relm
        account. You'll echo the confirmation token back into the game
        once it's done.
      </p>

      <div className="row">
        <span className="label">Player</span>
        <div className="mono">{player}</div>
      </div>

      <div className="row">
        <ConnectButton chainStatus="icon" />
      </div>

      {wrongChain && (
        <div className="row">
          <button
            className="btn"
            onClick={() => switchChain({ chainId: soneiumMinato.id })}
            disabled={switching}
          >
            {switching ? "Switching…" : "Switch to Soneium Minato"}
          </button>
        </div>
      )}

      {!wrongChain && isConnected && phase === "idle" && (
        <div className="row">
          <button className="btn" onClick={fetchChallenge}>
            Start challenge
          </button>
        </div>
      )}

      {phase === "loading" && <div className="row">Requesting challenge…</div>}

      {phase === "ready" && challenge && (
        <div className="row">
          <span className="label">Nonce</span>
          <div className="mono">{challenge.nonce}</div>
          {nonceHint && nonceHint !== challenge.nonce && (
            <p className="subtitle">
              (URL hint: {nonceHint} — using the fresh server-issued nonce instead.)
            </p>
          )}
          <button className="btn" onClick={signAndConfirm} style={{ marginTop: 12 }}>
            Sign with wallet
          </button>
        </div>
      )}

      {phase === "signing" && <div className="row">Waiting for wallet signature…</div>}
      {phase === "confirming" && <div className="row">Submitting to backend…</div>}

      {phase === "done" && confirmToken && (
        <>
          <div className="row status-ok">Linked.</div>
          <div className="row">
            Back in Relm, run:
            <div className="mono" style={{ marginTop: 6 }}>
              /wallet-set {address} {confirmToken}
            </div>
          </div>
        </>
      )}

      {phase === "error" && error && (
        <div className="row status-err">Error: {error}</div>
      )}
    </div>
  );
}
