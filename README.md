# Cipher Rocket

Cipher Rocket is a single-campaign, privacy-preserving fundraising dApp built on Zama FHEVM. It lets a fundraiser
create one campaign with a target and deadline, accept ETH contributions, and track encrypted contributor balances
and rewards without exposing individual contribution amounts inside contract state. The fundraiser can end the
campaign at any time and withdraw all raised ETH.

## Project summary

- Purpose: confidential fundraising with encrypted contribution tracking and encrypted reward points.
- Scope: a single active campaign per deployment.
- Networks: designed for Sepolia (Zama FHEVM) deployments.
- Privacy model: encrypted per-user stats and encrypted totals in contract state; ETH transfers remain public on-chain.

## Problem this project solves

Traditional fundraisers expose individual contribution amounts and balances on-chain. This discourages participation
when donors want confidentiality while still expecting transparent settlement and clear rewards. Cipher Rocket
separates value transfer (public ETH) from accounting and rewards (encrypted), enabling:

- Private contribution accounting and points.
- Transparent settlement and progress with a public ETH total.
- Clear, deterministic rewards without revealing contributor amounts in contract state.

## Advantages

- Confidential accounting: per-user and total contributions are stored as encrypted FHE values.
- Deterministic rewards: 1 ETH contributes 1,000,000 encrypted points, computed on-chain.
- On-chain settlement: ETH is held in the contract and forwarded to the fundraiser on campaign end.
- Minimal trust: encryption and access control are enforced by the Zama FHEVM runtime.
- Simple UX: contributors can decrypt their own stats; the fundraiser can decrypt totals.

## Core features

- Create a campaign with name, target amount, and end timestamp.
- Contribute ETH while logging encrypted contribution and encrypted points.
- Encrypted, per-user contribution balance and points ledger.
- Encrypted total contributions and points for the fundraiser.
- Campaign end and withdrawal by the fundraiser at any time.
- Public progress tracking using the clear total raised.

## How it works

1. The fundraiser creates a single campaign on-chain.
2. Contributors send ETH and an encrypted amount handle; the contract updates encrypted balances and points.
3. The contract tracks:
   - `totalRaised` in clear ETH for progress and settlement.
   - `_encryptedContributions` per address (encrypted).
   - `_encryptedPoints` per address (encrypted).
   - `_encryptedTotalRaised` and `_encryptedTotalPoints` (encrypted).
4. Contributors decrypt their own stats via the Zama relayer SDK and EIP-712 signatures.
5. The fundraiser can end the campaign and withdraw all ETH.

## Technology stack

- Smart contracts: Solidity 0.8.27, Zama FHEVM libraries.
- Dev framework: Hardhat + hardhat-deploy + TypeChain.
- Encryption: Zama FHEVM, relayer SDK for client-side encryption/decryption.
- Frontend: React + Vite.
- Wallet UX: RainbowKit + wagmi.
- Read calls: viem.
- Write calls: ethers v6.

## Repository structure

```
contracts/              Smart contracts (ConfidentialFundraiser is the core)
deploy/                 Hardhat deployment scripts
tasks/                  Custom Hardhat tasks for campaign actions
test/                   Contract tests (local FHEVM mock)
src/                    Frontend (React + Vite project)
```

## Smart contract details

Contract: `contracts/ConfidentialFundraiser.sol`

- Single campaign only: `createCampaign` can be called once.
- Config validation: name required, target > 0, endTimestamp must be in the future.
- Contribution flow:
  - ETH is transferred in the transaction.
  - Encrypted amount is added to contributor balance and encrypted totals.
  - Encrypted points are computed as `amount / 1_000_000_000_000`.
  - 1 ETH (1e18 wei) => 1,000,000 points.
- Permissions:
  - Contributors can decrypt their own encrypted contribution and points.
  - The fundraiser can decrypt the encrypted totals.
- Events:
  - `CampaignCreated`
  - `ContributionReceived`
  - `CampaignEnded`

Public vs encrypted data:

- Public: campaign configuration, fundraiser address, `totalRaised`.
- Encrypted: per-user contributions, per-user points, total encrypted raised, total encrypted points.
- Note: ETH amounts are still visible in transaction value; the encrypted ledger protects contract state balances.

## Frontend behavior

- Uses viem for read-only contract calls.
- Uses ethers for write transactions.
- Uses Zama relayer SDK for encryption and decryption.
- No local storage usage for sensitive state.
- No frontend environment variables; configuration is stored in source files.

Key frontend files:

- `src/src/components/FundraiserApp.tsx` UI and user flows.
- `src/src/config/contracts.ts` contract address and ABI.
- `src/src/config/wagmi.ts` WalletConnect project ID and chain config.
- `src/src/hooks/useZamaInstance.ts` Zama relayer SDK initialization.

## Setup prerequisites

- Node.js 20+
- npm
- WalletConnect Project ID (for RainbowKit)
- Sepolia ETH and a funded deployer account
- Root `.env` file for deployment only:
  - `INFURA_API_KEY`
  - `PRIVATE_KEY`
  - Optional: `ETHERSCAN_API_KEY`

Note: The deployer uses `PRIVATE_KEY` only. Mnemonics are intentionally not supported.

## Install dependencies

Root (contracts, tests, deployments):

```bash
npm install
```

Frontend:

```bash
cd src
npm install
```

## Test the contracts

```bash
npm run compile
npm run test
```

The test suite uses the local FHEVM mock and is not intended for Sepolia.

## Deploy to Sepolia

1. Ensure `.env` contains `INFURA_API_KEY` and `PRIVATE_KEY`.
2. Run tests and tasks locally first.
3. Deploy:

```bash
npx hardhat deploy --network sepolia
```

## Update frontend contract configuration

After deploying to Sepolia:

1. Copy the deployed address into `src/src/config/contracts.ts`.
2. Copy the ABI generated by Hardhat from `deployments/sepolia/ConfidentialFundraiser.json`.
3. Paste the ABI array into `src/src/config/contracts.ts` as `CONTRACT_ABI`.
4. Update the WalletConnect project ID in `src/src/config/wagmi.ts`.

No JSON imports are used in the frontend; the ABI is embedded as a TypeScript array.

## Run the frontend

```bash
cd src
npm run dev
```

Connect your wallet to Sepolia and use the UI to create a campaign, contribute, and decrypt stats.

## Hardhat task examples

```bash
npx hardhat task:address --network sepolia
npx hardhat task:campaign-info --network sepolia
npx hardhat task:create-campaign --name "Rocket Launch" --target "5" --end "1712345678" --network sepolia
npx hardhat task:contribute --value "0.25" --network sepolia
npx hardhat task:decrypt-contribution --network sepolia
npx hardhat task:decrypt-points --network sepolia
```

## Operational notes and constraints

- Only one campaign can exist per contract deployment.
- The fundraiser may end the campaign at any time; there is no on-chain enforcement of reaching the target.
- Encrypted balances rely on Zama FHEVM permissions; only authorized users can decrypt.
- The clear `totalRaised` is the authoritative settlement balance used for withdrawal.
- Frontend does not use environment variables or local storage for contract configuration.

## Future roadmap

- Multi-campaign support with per-campaign encrypted ledgers.
- Milestone-based releases and optional escrow.
- Contribution caps and whitelist windows (without exposing balances).
- Off-chain notifications and analytics dashboards.
- Indexer integration for faster UI updates.
- Multi-chain deployments as additional FHEVM networks are supported.
- Governance controls for campaign owners (pause, extend, or revise targets).

## License

BSD-3-Clause-Clear. See `LICENSE` for details.
