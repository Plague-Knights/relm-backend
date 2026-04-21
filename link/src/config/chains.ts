import { defineChain } from "viem";

// Soneium Minato testnet — same params as the server-side chain.ts,
// mirrored here because this file is shipped to the browser.
export const soneiumMinato = defineChain({
  id: 1946,
  name: "Soneium Minato",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://rpc.minato.soneium.org"] },
  },
  blockExplorers: {
    default: { name: "Blockscout", url: "https://soneium-minato.blockscout.com" },
  },
  testnet: true,
});
