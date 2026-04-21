"use client";

import { useEffect, useMemo, useState } from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAccount, useChainId, useSwitchChain, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { formatEther } from "viem";
import { soneiumMinato } from "@/config/chains";
import { RELM_COSMETIC_ADDRESS, RELM_COSMETIC_ABI } from "@/config/contracts";

type CosmeticType = {
  id: number;
  priceWei: string;
  active: boolean;
  metadataURI: string;
  maxSupply: number;
  minted: number;
  meta: {
    name: string;
    description: string;
    image: string;
    attributes: { trait_type: string; value: string }[];
  } | null;
};

export default function ShopPage() {
  const [items, setItems] = useState<CosmeticType[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingTypeId, setPendingTypeId] = useState<number | null>(null);

  const { isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChain, isPending: switching } = useSwitchChain();
  const { writeContract, data: txHash, error: writeErr, isPending: writing, reset } = useWriteContract();
  const { isLoading: confirming, isSuccess: confirmed } = useWaitForTransactionReceipt({ hash: txHash });

  const wrongChain = isConnected && chainId !== soneiumMinato.id;

  useEffect(() => {
    fetch("/api/cosmetics/list")
      .then(r => r.ok ? r.json() : Promise.reject(`status ${r.status}`))
      .then(d => setItems(d.types))
      .catch(e => setError(String(e)));
  }, []);

  useEffect(() => {
    if (confirmed) {
      // refetch counts so "minted/supply" updates
      fetch("/api/cosmetics/list").then(r => r.json()).then(d => setItems(d.types)).catch(() => {});
      setPendingTypeId(null);
      reset();
    }
  }, [confirmed, reset]);

  const writeMessage = useMemo(() => {
    if (writeErr) return writeErr.message;
    if (writing) return "Confirm in wallet…";
    if (confirming) return "Waiting for transaction…";
    if (confirmed) return "Minted ✓";
    return null;
  }, [writeErr, writing, confirming, confirmed]);

  function buy(t: CosmeticType) {
    setPendingTypeId(t.id);
    writeContract({
      address: RELM_COSMETIC_ADDRESS,
      abi: RELM_COSMETIC_ABI,
      functionName: "mint",
      args: [BigInt(t.id)],
      value: BigInt(t.priceWei),
    });
  }

  return (
    <div style={{ width: "100%", maxWidth: 920 }}>
      <div className="card" style={{ maxWidth: "none" }}>
        <h1 className="title">Relm · Shop</h1>
        <p className="subtitle">
          Cosmetic NFTs on Soneium Minato. Pay in ETH, your wallet receives an
          ERC-721 from <code>{RELM_COSMETIC_ADDRESS.slice(0, 10)}…</code>. Items
          render in-game once your wallet is linked via <a href="/link" style={{ color: "var(--accent)" }}>/link</a>.
        </p>

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

        {writeMessage && (
          <div className="row" style={{ color: writeErr ? "#ff7474" : "var(--accent)" }}>
            {writeMessage}
          </div>
        )}

        {error && <div className="row status-err">Error: {error}</div>}
        {!error && !items && <div className="row">Loading shop…</div>}

        {items && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14, marginTop: 18 }}>
            {items.map(t => {
              const soldOut = t.maxSupply !== 0 && t.minted >= t.maxSupply;
              const disabled = !isConnected || wrongChain || writing || confirming || pendingTypeId !== null || soldOut || !t.active;
              return (
                <div key={t.id} style={{
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid var(--border)",
                  borderRadius: 12,
                  padding: 14,
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                }}>
                  {t.meta?.image && (
                    <img src={t.meta.image} alt={t.meta.name}
                         style={{ width: "100%", height: 140, objectFit: "contain", background: "rgba(0,0,0,0.25)", borderRadius: 8 }} />
                  )}
                  <div style={{ fontWeight: 700 }}>{t.meta?.name ?? `Type #${t.id}`}</div>
                  <div className="subtitle" style={{ margin: 0 }}>{t.meta?.description}</div>
                  <div className="mono" style={{ fontSize: 13 }}>
                    {Number(formatEther(BigInt(t.priceWei))).toFixed(4)} ETH
                  </div>
                  <div className="subtitle" style={{ margin: 0, fontSize: 12 }}>
                    {t.maxSupply === 0
                      ? `${t.minted} minted`
                      : `${t.minted} / ${t.maxSupply} minted${soldOut ? " · sold out" : ""}`}
                  </div>
                  <button className="btn" onClick={() => buy(t)} disabled={disabled}>
                    {soldOut ? "Sold out" : !t.active ? "Unavailable" : "Mint"}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
