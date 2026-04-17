import * as anchor from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { Consortium } from "../../target/types/consortium";
import { getConsortiumConfigPDA } from "./utils";

// Provide instructions.
if (process.argv.indexOf("--help") > -1) {
  console.log(`Usage: PROGRAM_ID=<program_id> ANCHOR_PROVIDER_URL=<rpc_url> ANCHOR_WALLET=<wallet_path> yarn gmp_consortiumGetConfig

    Posts signatures to the session already created on Consortium contract. `);
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
const program = new anchor.Program(require("../../target/idl/consortium.json"), provider) as anchor.Program<Consortium>;

if (!program.programId.equals(programId)) {
  console.error("the program id in the idl does not match the program id passed as env variable");
  process.exit(1);
}

(async () => {
  try {
    const payer = provider.wallet.publicKey; // Get wallet address

    // Derive PDA for session
    const configPDA = getConsortiumConfigPDA(programId);
    console.log("Config PDA:", configPDA.toBase58());

    const configData = await program.account.config.fetch(configPDA);

    console.log(`Consortium config: ${JSON.stringify(configData)}`)

  } catch (err) {
    console.error("Error creating new session:", err);
  }
})();
