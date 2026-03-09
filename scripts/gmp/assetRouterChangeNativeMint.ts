import * as anchor from "@coral-xyz/anchor";
import * as spl from "@solana/spl-token";
import { PublicKey } from "@solana/web3.js";
import { getBase58EncodedTxBytes } from "../utils";
import { AssetRouter } from "../../target/types/asset_router";

const ASSET_ROUTER_CONFIG_SEED = Buffer.from("asset_router_config");
const TOKEN_AUTHORITY_SEED = Buffer.from("token_authority");

// Provide instructions.
if (process.argv.indexOf("--help") > -1) {
  console.log(`Usage: PROGRAM_ID=<asset_router_program_id> ANCHOR_PROVIDER_URL=<rpc_url> ANCHOR_WALLET=<wallet_path> yarn gmp_assetRouterChangeNativeMint <new_mint>

    Updates the native mint address. `);
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

const newNativeMint = new PublicKey(process.argv[2]);

(async () => {
  try {
    const payer = provider.wallet.publicKey;
    const configPDA = PublicKey.findProgramAddressSync([ASSET_ROUTER_CONFIG_SEED], programId)[0];
    const tokenAuthority = PublicKey.findProgramAddressSync([TOKEN_AUTHORITY_SEED], programId)[0];

    console.log("Using config PDA:", configPDA.toBase58());
    console.log("Using token authority PDA:", tokenAuthority.toBase58());

    const cfg = await program.account.config.fetch(configPDA);

    console.log("Current Native Mint:", cfg.nativeMint.toBase58());
    console.log("New Native Mint:", newNativeMint.toBase58());

    const tx = await program.methods.changeNativeMint(newNativeMint).accounts({
      payer,
    });

    if (populate) {
      console.log("Transaction bytes:", await getBase58EncodedTxBytes(await tx.instruction(), provider.connection));
    } else {
      console.log("Transaction Signature:", await tx.rpc());
    }
  } catch (err) {
    console.error("Error changing asset router native mint:", err);
    process.exit(1);
  }
})();
