// Mirrors the addresses in server/.env so the browser can call the
// contracts directly via wagmi.

export const RELM_COSMETIC_ADDRESS = "0x16d872c874f698c182603e2975602e6677353574" as const;
export const RELM_TOKEN_ADDRESS    = "0x5caF5D0c542Cd515651dADfC4197D343DDcB2D51" as const;
export const RELM_REFILL_ADDRESS   = "0xe41cb4abd76dc37763450b0b7a1826e5177615a9" as const;

export const RELM_REFILL_ABI = [
  {
    type: "function", name: "refill", stateMutability: "nonpayable",
    inputs: [], outputs: [],
  },
  {
    type: "function", name: "refillPrice", stateMutability: "view",
    inputs: [], outputs: [{ type: "uint256" }],
  },
  {
    type: "function", name: "refillAmount", stateMutability: "view",
    inputs: [], outputs: [{ type: "uint256" }],
  },
] as const;

export const RELM_COSMETIC_ABI = [
  {
    type: "function", name: "mint", stateMutability: "payable",
    inputs: [{ name: "typeId", type: "uint256" }],
    outputs: [{ name: "tokenId", type: "uint256" }],
  },
  {
    type: "function", name: "mintWithRelm", stateMutability: "nonpayable",
    inputs: [{ name: "typeId", type: "uint256" }],
    outputs: [{ name: "tokenId", type: "uint256" }],
  },
] as const;

// Minimal ERC-20 surface — enough for approve + balance + allowance.
export const RELM_TOKEN_ABI = [
  {
    type: "function", name: "approve", stateMutability: "nonpayable",
    inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function", name: "allowance", stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }, { name: "spender", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function", name: "balanceOf", stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
] as const;
