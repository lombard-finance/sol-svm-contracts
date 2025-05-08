# Convenience scripts

This folder contains convenient scripts to make transactions to the LBTC program. The commands are run from the repository root (not this folder!) and the available commands are located in the `package.json` file.

As an example, to run `enableWithdrawals`, you would use:

```
PROGRAM_ID=HEY7PCJe3GB27UWdopuYb1xDbB5SNtTcYPxRjntvfBSA ANCHOR_PROVIDER_URL=https://api.devnet.solana.com ANCHOR_WALLET=id.json yarn enableWithdrawals
```

The scripts will take the program id as an env variable, and will compare this against the compiled IDL just to ensure that the correct program is targeted.

To learn about usage of a specific script, just run it as such:

```
yarn enableWithdrawals --help
```

To get the base58 encoded bytes of a transaction for using on Squads, append `--populate` at the end of your command.

NOTE: If you need to generate bytes for a transaction where a multisig is the payer, you will need to update the line:

```
const payer = provider.wallet.publicKey;
```

To be:

```
const payer = new PublicKey("<MULTISIG_PK>");
```

## Valset update ordering

- createMetadata
- postMetadata
- createValsetPayload
- postValsetSignatures
- setNextValidatorSet

## Posting validator set signatures

When posting validator set signatures, you will need some extra tooling to do it properly. Install `ethabi`: https://github.com/rust-ethereum/ethabi

With this installed, for a new validator set update, you can fetch the signatures by querying Ledger for the notarization session of the validator set update. If you don't know the session number, it can be fetched from https://www.mintscan.io/lombard/notary?sector=session and then clicking on any session. In the `Participations` portion of any of the sessions, it will tell you a block height from which the validator set session was started. Navigate to the session at this block height and find the session number. Then, to fetch the session information, clone https://github.com/lombard-finance/api-backend, and use the `utils/notary-session` branch. Run:

```
go build -o ./build/get-notary-session ./cmd/get-notary-session/main.go
```

You can then get the session details with:

```
./build/get-notary-session --grpc grpc-mainnet.lb-mgt.com:443 --session <SESSION_NUMBER> --timeout 30
```

Here you will be given the full payload and the signatures blob, as well as the different weights for each validator. You can use the valset payload for any valset related scripts, and the signatures blob can be unwrapped by using `ethabi` like so:

```
ethabi decode params -t 'bytes[]' <SIGNATURES>
```

This will print an array of comma-separated signatures. The last thing left to do is to write the indices, which you can do with `0,1,2,...`
