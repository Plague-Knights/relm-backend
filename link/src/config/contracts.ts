// Mirrors the addresses in server/.env so the browser can call the
// contracts directly via wagmi.

export const RELM_COSMETIC_ADDRESS = "0xb39226174bd768ef1c6a16037a4d3acce0832da3" as const;

export const RELM_COSMETIC_ABI = [
  {
    type: "function", name: "mint", stateMutability: "payable",
    inputs: [{ name: "typeId", type: "uint256" }],
    outputs: [{ name: "tokenId", type: "uint256" }],
  },
  {
    type: "function", name: "cosmeticTypes", stateMutability: "view",
    inputs: [{ type: "uint256" }],
    outputs: [
      { name: "priceWei", type: "uint256" },
      { name: "active", type: "bool" },
      { name: "metadataURI", type: "string" },
      { name: "maxSupply", type: "uint256" },
      { name: "minted", type: "uint256" },
    ],
  },
] as const;
