"use client";

import { useEffect, useMemo, useState } from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAccount, useChainId, useSwitchChain, useWriteContract, useWaitForTransactionReceipt, useReadContract } from "wagmi";
import { formatEther } from "viem";
import { soneiumMinato } from "@/config/chains";
import { RELM_COSMETIC_ADDRESS, RELM_COSMETIC_ABI, RELM_TOKEN_ADDRESS, RELM_TOKEN_ABI } from "@/config/contracts";

type CosmeticType = {
  id: number;
  priceWei: string;
  priceRelm: string;
  active: boolean;
  metadataURI: string;
  maxSupply: number;
  minted: number;
  itemId: string;
  perks: number;
  perksList: string[];
  meta: {
    name: string;
    description: string;
    image: string;
    attributes: { trait_type: string; value: string }[];
  } | null;
};

const PERK_LABELS: Record<string, string> = {
  unbreakable: "Unbreakable",
  keep_on_death: "Keep on Death",
  soulbound: "Soulbound",
  auto_pickup: "Auto-pickup",
};

export default function ShopPage() {
  const [items, setItems] = useState<CosmeticType[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTypeId, setActiveTypeId] = useState<number | null>(null);
  const [activeMode, setActiveMode] = useState<"eth" | "relm" | null>(null);

  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChain, isPending: switching } = useSwitchChain();
  const { writeContract, data: txHash, error: writeErr, isPending: writing, reset } = useWriteContract();
  const { isLoading: confirming, isSuccess: confirmed } = useWaitForTransactionReceipt({ hash: txHash });

  const wrongChain = isConnected && chainId !== soneiumMinato.id;

  const { data: relmAllowance, refetch: refetchAllowance } = useReadContract({
    address: RELM_TOKEN_ADDRESS,
    abi: RELM_TOKEN_ABI,
    functionName: "allowance",
    args: address ? [address, RELM_COSMETIC_ADDRESS] : undefined,
    query: { enabled: !!address },
  });

  useEffect(() => {
    fetch("/api/cosmetics/list")
      .then(r => r.ok ? r.json() : Promise.reject(`status ${r.status}`))
      .then(d => setItems(d.types))
      .catch(e => setError(String(e)));
  }, []);

  useEffect(() => {
    if (confirmed) {
      fetch("/api/cosmetics/list").then(r => r.json()).then(d => setItems(d.types)).catch(() => {});
      refetchAllowance();
      setActiveTypeId(null);
      setActiveMode(null);
      reset();
    }
  }, [confirmed, reset, refetchAllowance]);

  const writeMessage = useMemo(() => {
    if (writeErr) return writeErr.message;
    if (writing) return "Confirm in wallet…";
    if (confirming) return "Waiting for transaction…";
    if (confirmed) return "Minted ✓";
    return null;
  }, [writeErr, writing, confirming, confirmed]);

  function buyEth(t: CosmeticType) {
    setActiveTypeId(t.id);
    setActiveMode("eth");
    writeContract({
      address: RELM_COSMETIC_ADDRESS,
      abi: RELM_COSMETIC_ABI,
      functionName: "mint",
      args: [BigInt(t.id)],
      value: BigInt(t.priceWei),
    });
  }

  function buyRelm(t: CosmeticType) {
    setActiveTypeId(t.id);
    setActiveMode("relm");
    const need = BigInt(t.priceRelm);
    if ((relmAllowance as bigint | undefined ?? 0n) < need) {
      writeContract({
        address: RELM_TOKEN_ADDRESS,
        abi: RELM_TOKEN_ABI,
        functionName: "approve",
        args: [RELM_COSMETIC_ADDRESS, need],
      });
      return;
    }
    writeContract({
      address: RELM_COSMETIC_ADDRESS,
      abi: RELM_COSMETIC_ABI,
      functionName: "mintWithRelm",
      args: [BigInt(t.id)],
    });
  }

  // After approve confirms, fire the mintWithRelm.
  useEffect(() => {
    if (!confirmed || activeMode !== "relm" || activeTypeId == null || !items) return;
    const t = items.find(x => x.id === activeTypeId);
    if (!t) return;
    if ((relmAllowance as bigint | undefined ?? 0n) >= BigInt(t.priceRelm)) return; // approve might have flipped state; fall through
  }, [confirmed, activeMode, activeTypeId, items, relmAllowance]);

  return (
    <div style={{ width: "100%", maxWidth: 1080 }}>
      <div className="card" style={{ maxWidth: "none" }}>
        <h1 className="title">Relm · Shop</h1>
        <p className="subtitle">
          Pay in <b>ETH</b> for premium / founder items, or in <b>RELM</b> (the
          gameplay token you earn by mining and crafting). Every cosmetic has a
          perk profile — items with utility are explicitly noted, the rest are
          purely visual. Items render in-game once your wallet is linked via
          {" "}<a href="/link" style={{ color: "var(--accent)" }}>/link</a>.
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
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 14, marginTop: 18 }}>
            {items.map(t => {
              const soldOut = t.maxSupply !== 0 && t.minted >= t.maxSupply;
              const ethEnabled = BigInt(t.priceWei) > 0n;
              const relmEnabled = BigInt(t.priceRelm) > 0n;
              const baseDisabled = !isConnected || wrongChain || writing || confirming || soldOut || !t.active;
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
                  {t.itemId && (
                    <div className="mono" style={{ fontSize: 11, opacity: 0.7 }}>
                      skins {t.itemId}
                    </div>
                  )}
                  <div className="subtitle" style={{ margin: 0, fontSize: 12 }}>{t.meta?.description}</div>

                  {t.perksList.length > 0 && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 4 }}>
                      {t.perksList.map(p => (
                        <span key={p} style={{
                          fontSize: 10,
                          padding: "3px 7px",
                          borderRadius: 999,
                          background: "rgba(127,227,255,0.12)",
                          color: "var(--accent)",
                          letterSpacing: "0.04em",
                          textTransform: "uppercase",
                          fontWeight: 600,
                        }}>{PERK_LABELS[p] ?? p}</span>
                      ))}
                    </div>
                  )}

                  <div className="subtitle" style={{ margin: "6px 0 0", fontSize: 12 }}>
                    {t.maxSupply === 0
                      ? `${t.minted} minted`
                      : `${t.minted} / ${t.maxSupply} minted${soldOut ? " · sold out" : ""}`}
                  </div>

                  <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
                    {ethEnabled && (
                      <button
                        className="btn"
                        style={{ flex: 1, fontSize: 13 }}
                        onClick={() => buyEth(t)}
                        disabled={baseDisabled || (activeTypeId !== null && activeTypeId !== t.id)}
                      >
                        {Number(formatEther(BigInt(t.priceWei))).toFixed(4)} ETH
                      </button>
                    )}
                    {relmEnabled && (
                      <button
                        className="btn"
                        style={{ flex: 1, fontSize: 13, background: "#9c7cff" }}
                        onClick={() => buyRelm(t)}
                        disabled={baseDisabled || (activeTypeId !== null && activeTypeId !== t.id)}
                      >
                        {Math.round(Number(formatEther(BigInt(t.priceRelm))))} RELM
                      </button>
                    )}
                  </div>
                  {!ethEnabled && !relmEnabled && (
                    <div className="subtitle" style={{ margin: 0, fontSize: 12, opacity: 0.6 }}>Not for sale</div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
