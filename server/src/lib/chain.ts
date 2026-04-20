import { createPublicClient, createWalletClient, http, defineChain } from "viem";
import { privateKeyToAccount } from "viem/accounts";

// Soneium Minato testnet. Mainnet Soneium is chainId 1868; Minato
// (testnet) is 1946. Match soneium-expedition's RPC choice.
export const soneiumMinato = defineChain({
  id: 1946,
  name: "Soneium Minato",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: [process.env.MINATO_RPC_URL ?? "https://rpc.minato.soneium.org"] },
  },
  blockExplorers: {
    default: { name: "Blockscout", url: "https://soneium-minato.blockscout.com" },
  },
  testnet: true,
});

export const publicClient = createPublicClient({
  chain: soneiumMinato,
  transport: http(),
});

// Wallet client for signing mint txs. Errors loudly if the key is
// missing rather than silently acting as a read-only client — losing
// a signer in production is the kind of thing we want to crash on.
export function walletClient() {
  const key = process.env.SIGNER_PRIVATE_KEY;
  if (!key) throw new Error("SIGNER_PRIVATE_KEY must be set");
  const normalized = key.startsWith("0x") ? key : `0x${key}`;
  const account = privateKeyToAccount(normalized as `0x${string}`);
  return createWalletClient({
    account,
    chain: soneiumMinato,
    transport: http(),
  });
}
