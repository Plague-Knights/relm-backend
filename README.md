# relm-backend

Closed-source service + smart contracts behind [Relm](https://github.com/Plague-Knights/relm-game). Target chain: Soneium Minato (testnet, chainId 1946).

## Layout

```
relm-backend/
├── server/                    # Express + viem + Prisma + SIWE
│   ├── src/
│   │   ├── index.ts
│   │   ├── routes/
│   │   │   ├── wallet.ts     # /api/wallet/challenge + /confirm (SIWE)
│   │   │   └── rewards.ts    # /api/rewards/ingest (batched from Lua)
│   │   └── lib/
│   │       ├── chain.ts      # viem clients for Minato
│   │       ├── prisma.ts     # singleton
│   │       └── siwe.ts       # challenge + verify
│   ├── prisma/schema.prisma  # PlayerWallet, WalletChallenge, RewardEvent
│   └── .env.example
└── contracts/                 # Foundry
    ├── foundry.toml           # Minato RPC + Blockscout etherscan
    ├── src/RelmToken.sol      # ERC-20, minter-gated
    ├── script/Deploy.s.sol
    └── test/RelmToken.t.sol
```

## First run (server)

```bash
pnpm install
cd server
cp .env.example .env
# fill in RELM_BACKEND_SECRET, SIGNER_PRIVATE_KEY (after the contract's deployed)
pnpm db:push       # creates dev.db + tables
pnpm dev           # watches src/ and restarts on change
```

## First run (contracts on Minato)

```bash
cd contracts
forge install --no-commit OpenZeppelin/openzeppelin-contracts foundry-rs/forge-std
forge test                                     # unit tests
forge script script/Deploy.s.sol:Deploy \
  --rpc-url soneium_minato \
  --broadcast \
  --private-key $DEPLOYER_PRIVATE_KEY
```

After deploy, copy the address into `server/.env` as `RELM_TOKEN_ADDRESS` and restart the server. The minter role is set at constructor time — use the signer address from `SIGNER_PRIVATE_KEY` as the `RELM_MINTER` env when deploying.

## Endpoints

| method | path | purpose |
|--------|------|---------|
| GET    | /healthz | liveness |
| POST   | /api/wallet/challenge | issue SIWE nonce + browser URL for a player |
| POST   | /api/wallet/confirm   | verify signature + bind player → address |
| POST   | /api/rewards/ingest   | accept batched gameplay events (X-Relm-Secret required) |

## Next

- `/link` browser page: ConnectKit or plain wagmi, signs the SIWE message, posts to `/confirm`
- Scorer worker: periodically picks up unscored `RewardEvent` rows, runs the reward curve, queues mint batches
- Minter worker: drains mint queue in batches via `RelmToken.mintBatch`
