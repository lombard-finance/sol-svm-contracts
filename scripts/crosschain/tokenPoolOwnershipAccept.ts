import * as anchor from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { getBase58EncodedTxBytes } from "../utils";
import { LombardTokenPool } from "../../target/types/lombard_token_pool";
import { getTokenPoolState } from "./utils";

// Provide instructions.
if (process.argv.indexOf("--help") > -1) {
  console.log(`Usage: PROGRAM_ID=<asset_router_program_id> ANCHOR_PROVIDER_URL=<rpc_url> ANCHOR_WALLET=<wallet_path> yarn crosschain_tokenPoolAcceptOwnership <mint address> <new_admin> [--populate]

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
const program = new anchor.Program(require("../../target/idl/lombard_token_pool.json"), provider) as anchor.Program<LombardTokenPool>;

if (!program.programId.equals(programId)) {
  console.error("the program id in the idl does not match the program id passed as env variable");
  process.exit(1);
}

// If we have a populate flag at the end of the call, we return the bytes.
let populate = process.argv.at(-1) === "--populate";

const mint = new PublicKey(process.argv[2]);
const newAdmin = new PublicKey(process.argv[3]);

(async () => {
  try {
    const statePDA = getTokenPoolState(mint, programId);

    console.log("Using state(config) PDA:", statePDA.toBase58());

    const tx = await program.methods.acceptOwnership().accounts({
      authority: newAdmin,
      mint: mint,
      state: statePDA
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
