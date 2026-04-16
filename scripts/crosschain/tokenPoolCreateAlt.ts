import * as anchor from "@coral-xyz/anchor";
import { PublicKey, AddressLookupTableProgram } from "@solana/web3.js";
import { getBase58EncodedTxBytes, getConfigPDA } from "../utils";
import { LombardTokenPool } from "../../target/types/lombard_token_pool";
import { getTokenPoolSigner, getTokenPoolState } from "./utils";

// Provide instructions.
if (process.argv.indexOf("--help") > -1) {
  console.log(`Usage: ANCHOR_PROVIDER_URL=<rpc_url> ANCHOR_WALLET=<wallet_path> yarn crosschain_tokenPoolCreateAlt <admin>

    Initializes state config for the LombardTokenPool contract. `);
  process.exit(0);
}

const provider = anchor.AnchorProvider.env();
anchor.setProvider(provider);

const admin = new PublicKey(process.argv[2]);

(async () => {
  try {
    const deployer = provider.wallet.publicKey; // Get wallet address

    const slot = await provider.connection.getSlot();
    const [lookupTableInst, lookupTableAddress] =
    AddressLookupTableProgram.createLookupTable({
      authority: admin,
      payer: deployer,
      recentSlot: slot
    });

    console.log("lookup table address:", lookupTableAddress.toBase58());

  } catch (err) {
    console.error("Error creating ALT:", err);
  }
})();
