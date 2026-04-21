import * as anchor from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { getBase58EncodedTxBytes } from "../utils";
import { AssetRouter } from "../../target/types/asset_router";

const ASSET_ROUTER_CONFIG_SEED = Buffer.from("asset_router_config");
const TOKEN_AUTHORITY_SEED = Buffer.from("token_authority");

// Provide instructions.
if (process.argv.indexOf("--help") > -1) {
  console.log(`Usage: PROGRAM_ID=<asset_router_program_id> ANCHOR_PROVIDER_URL=<rpc_url> ANCHOR_WALLET=<wallet_path> yarn gmp_assetRouterAcceptOwnership  [--populate]

    Updates the native mint authority through asset_router::change_mint_auth.
    WARNING: This can break minting functionality if misconfigured.`);
  process.exit(0);
}

const provider = anchor.AnchorProvider.env();
anchor.setProvider(provider);

// Check for program ID match.
if (!process.env.PROGRAM_ID) {
  console.error("no program Id set");
  process.exit(1);
}
const programId = new PublicKey(process.env.PROGRAM_ID);
const program = new anchor.Program(require("../../target/idl/asset_router.json"), provider) as anchor.Program<AssetRouter>;

if (!program.programId.equals(programId)) {
  console.error("the program id in the idl does not match the program id passed as env variable");
  process.exit(1);
}

// If we have a populate flag at the end of the call, we return the bytes.
let populate = process.argv.at(-1) === "--populate";

(async () => {
  try {
    const payer = provider.wallet.publicKey;
    const configPDA = PublicKey.findProgramAddressSync([ASSET_ROUTER_CONFIG_SEED], programId)[0];

    console.log("Using config PDA:", configPDA.toBase58());

    const tx = await program.methods.acceptOwnership().accounts({
      payer,
      config: configPDA
    });

    if (populate) {
      console.log("Transaction bytes:", await getBase58EncodedTxBytes(await tx.instruction(), provider.connection));
    } else {
      console.log("Transaction Signature:", await tx.rpc());
    }
  } catch (err) {
    console.error("Error changing asset router mint authority:", err);
    process.exit(1);
  }
})();
