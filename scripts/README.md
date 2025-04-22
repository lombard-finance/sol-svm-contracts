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
