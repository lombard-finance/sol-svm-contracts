import * as anchor from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { getMailboxConfigPDA } from "./utils";
import { Mailbox } from "../../target/types/mailbox";

// Provide instructions.
if (process.argv.indexOf("--help") > -1) {
  console.log(`Usage: PROGRAM_ID=<program_id> ANCHOR_PROVIDER_URL=<rpc_url> ANCHOR_WALLET=<wallet_path> yarn gmp_mailboxGetConfig

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
const program = new anchor.Program(require("../../target/idl/mailbox.json"), provider) as anchor.Program<Mailbox>;

if (!program.programId.equals(programId)) {
  console.error("the program id in the idl does not match the program id passed as env variable");
  process.exit(1);
}

(async () => {
  try {
    const admin = provider.wallet.publicKey; // Get wallet address
    const configPDA = getMailboxConfigPDA(programId);

    console.log(`Mailbox config PDA: ${configPDA.toBase58()}`);

    const config = await program.account.config.fetch(configPDA);
    console.log(`config contents: ${JSON.stringify(config)}`)

  } catch (err) {
    console.error("Error setting initial validator set:", err);
  }

})();
