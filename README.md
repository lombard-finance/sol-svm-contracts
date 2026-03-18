# LBTC Solana programs

[Website](https://www.lombard.finance/) | [Docs](https://docs.lombard.finance/)

## Content
1. [Overview](https://github.com/lombard-finance/sol-svm-contracts?tab=readme-ov-file#overview)
2. [One-time setup](https://github.com/lombard-finance/sol-svm-contracts?tab=readme-ov-file#one-time-setup)
3. [Audit](https://github.com/lombard-finance/sol-svm-contracts?tab=readme-ov-file#audit)

## Overview
LBTC is liquid Bitcoin; it's yield-bearing, cross-chain, and 1:1 backed by BTC. LBTC enables yield-bearing BTC to move cross-chain without fragmenting liquidity, and is designed to seamlessly integrate Bitcoin into the decentralized finance (DeFi) ecosystem while maintaining the security and integrity of the underlying asset.

| Program   | Description | Deployment                                                                                                                           |
|------------------|----------------------------------------------------------------------------------------------------------------------------------------|-|
| Bascule          | Bascule drawbridge designed to prevent bridge hacks before they hit the chain.                                                         | E1p8P6TTe8QvKmSK7QZ3n7HtQY9hE1p9JrCwLrXnPUfn |
| LBTC             | Native minting program for LBTC.                                                                                                 | LomP48F7bLbKyMRHHsDVt7wuHaUQvQnVVspjcbfuAek |
| Token | LBTC token | LBTCgU4b3wsFKsPwBn1rRZDx5DoFutM6RPiEt1TPDsY |

## Contracts Breakdown
### Consortium

The **Consortium** contract is the core notary and governance program for the LBTC protocol on Solana. It manages a decentralized set of validators (the "consortium") responsible for attesting to payloads originating from the Lombard Ledger consortium. This contract provides a secure, multi-signature validation mechanism for cross-chain and protocol-critical actions.

Currently program does not track the validator set history.

#### Key Features

- **Validator Set Management:**  
  The contract allows for the initialization and dynamic updating of the validator set, including their weights and the threshold required for consensus. Only the admin (or a designated owner) can set the initial validator set, but subsequent updates can be proposed and finalized by anyone, provided they are accompanied by valid signatures from the current consortium.

- **Session Lifecycle & Payload Handling:**  
  - For most payloads, only the hash of the payload is required for validation and notarization.
  - For validator set updates, the payload may be large and is therefore submitted in chunks.
  - Each session tracks the payload hash, the participating validators, and the collection of their signatures.

- **ValidatedPayload PDA:**  
  Once a payload is successfully validated by the consortium (i.e., enough valid signatures are collected), a `ValidatedPayload` Program Derived Address (PDA) is created.  
  - **External Readability:** This PDA is designed to be read by external contracts and programs, providing a canonical, on-chain proof that a given payload has been validated by the consortium.  
  - This enables seamless integration with other Solana programs and ensures that only properly validated actions are executed.

- **Security & Upgradability:**  
  Ownership can be transferred securely via a two-step process (propose and accept).

### BTC deposit flow
Graph below represents BTC to LBTC flow

```mermaid
graph TD
    user_btc_wallet(User BTC wallet) -.-> btc{{BTC}}
    btc -- deposit --> btc_wallet(Lombard controlled BTC address)
    btc_wallet -. notarization request .-> consortium[Notary Consortium]
    consortium -. notarization result .-> sc[LBTC Program]
    sc -- mint --> lbtc{{LBTC}}
    lbtc -.-> user_sol_wallet(User SOL wallet)
```

### BTC redeem flow
Graph below represents LBTC to BTC flow
```mermaid
graph TD
    user_sol_wallet(User SOL wallet) -.-> lbtc{{LBTC}}
    lbtc -- redeem --> sc[LBTC Program]
    sc -. notarization request .-> consortium[Notary Consortium]
    consortium -. notarization result .-> custody[Custody approvers]
    custody -.-> btc{{BTC}}
    btc --> user_btc_wallet(User BTC wallet)
```

## One-time setup

Install [nodejs](https://nodejs.org/en/download/package-manager). Run node -v to check your installation.

Supports Node.js 18.x and higher.

Also, you will need to install `solana` and `anchor`. Instructions are [here](https://www.anchor-lang.com/docs/installation). Ensure you are using the same versions that are listed in the [Anchor.toml](https://github.com/lombard-finance/sol-svm-contracts/tree/main/Anchor.toml) file.

### 1. Clone this repo:
```bash
git clone https://github.com/lombard-finance/sol-svm-contracts.git
```
### 2. Install dependencies
```bash
yarn
```

### 3. Compile smart contracts

```bash
anchor build
```

### 4. Run tests

```bash
anchor test
```

## Audit

Find the latest audit reports in [docs/audit](https://github.com/lombard-finance/sol-svm-contracts/tree/main/docs/audit)


## Verify On-Chain Programs

Create a deterministic build

```bash
solana-verify build
```

get hash of built binary with

```bash
solana-verify get-executable-hash target/deploy/bascule.so
solana-verify get-executable-hash target/deploy/lbtc.so
```

compare with hash from chain

```bash
solana-verify get-program-hash <program-address>
```