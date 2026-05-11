import * as anchor from "@coral-xyz/anchor";
import { PublicKey, AddressLookupTableProgram } from "@solana/web3.js";
import { getBase58EncodedTxBytes } from "../utils";

// Provide instructions.
if (process.argv.indexOf("--help") > -1) {
  console.log(`Usage: ANCHOR_PROVIDER_URL=<rpc_url> ANCHOR_WALLET=<wallet_path> yarn crosschain_tokenPoolAddToAlt <admin> <alt address> <addresses> [--populate] 

    Initializes state config for the LombardTokenPool contract. `);
  process.exit(0);
}

const provider = anchor.AnchorProvider.env();
anchor.setProvider(provider);

// If we have a populate flag at the end of the call, we return the bytes.
let populate = process.argv.at(-1) === "--populate";

const admin = new PublicKey(process.argv[2]);
const alt = new PublicKey(process.argv[3]);
const addrs: PublicKey[] = []
process.argv[4].split(",").forEach(addr => addrs.push(new PublicKey(addr)));

(async () => {
  try {
    const deployer = provider.wallet.publicKey; // Get wallet address

    const ix =
    AddressLookupTableProgram.extendLookupTable({
      payer: deployer,
      authority: admin,
      lookupTable: alt,
      addresses: addrs
    });

    if (populate) {
      console.log("Transaction bytes:", await getBase58EncodedTxBytes(ix, provider.connection));
    } else {
      const tx = new anchor.web3.Transaction().add(ix);
      const txSig = await provider.sendAndConfirm(tx);
      console.log("Transaction Signature:", txSig);
      const lookupTableAccount = (
        await provider.connection.getAddressLookupTable(alt)
      ).value;

      // loop through and parse all the addresses stored in the table
      for (let i = 0; i < lookupTableAccount!.state.addresses.length; i++) {
        const address = lookupTableAccount!.state.addresses[i];
        console.log(i, address.toBase58());
      }
    }

  } catch (err) {
    console.error("Error creating ALT:", err);
  }
})();
