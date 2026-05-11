import * as anchor from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { getBase58EncodedTxBytes } from "../utils";
import { AssetRouter } from "../../target/types/asset_router";
import { getAssetRouterTokenConfigPDA } from "./utils";

// Provide instructions.
if (process.argv.indexOf("--help") > -1) {
  console.log(`Usage: PROGRAM_ID=<program_id> ANCHOR_PROVIDER_URL=<rpc_url> ANCHOR_WALLET=<wallet_path> yarn gmp_assetRouterGetTokenConfig <mint>

    Initializes the Mailbox contract. `);
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

const mint = new PublicKey(process.argv[2]);

(async () => {
    const admin = provider.wallet.publicKey; // Get wallet address

    const configPDA = getAssetRouterTokenConfigPDA(programId, mint);
    console.log("Using config PDA:", configPDA.toBase58());

    const data = await program.account.tokenConfig.fetch(configPDA);

    console.log(`Token config: ${JSON.stringify(data)}`)
})();
