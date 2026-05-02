import * as anchor from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { getBase58EncodedTxBytes } from "../utils";
import { Mailbox } from "../../target/types/mailbox";
import { ACCOUNT_ROLES_SEED, MAILBOX_CONFIG_SEED } from "./constants";

// Provide instructions.
if (process.argv.indexOf("--help") > -1) {
  console.log(`Usage: PROGRAM_ID=<program_id> ANCHOR_PROVIDER_URL=<rpc_url> ANCHOR_WALLET=<wallet_path> yarn gmp_mailboxPause <admin> [--populate]

    Pause Mailbox contract. `);
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

// If we have a populate flag at the end of the call, we return the bytes.
let populate = process.argv.at(-1) === "--populate";

const admin = new PublicKey(process.argv[2]);

(async () => {
  try {
    const configPDA = PublicKey.findProgramAddressSync([MAILBOX_CONFIG_SEED], programId)[0];

    console.log("Using config PDA:", configPDA.toBase58());

    const accountRolesPDA = PublicKey.findProgramAddressSync([ACCOUNT_ROLES_SEED, admin.toBytes()], programId)[0];

    const tx = await program.methods.pause().accounts({
      pauser: admin,
      // accountRoles: accountRolesPDA,
      config: configPDA
    });

    if (populate) {
      console.log("Transaction bytes:", await getBase58EncodedTxBytes(await tx.instruction(), provider.connection));
    } else {
      console.log("Transaction Signature:", await tx.rpc());
    }
  } catch (err) {
    console.error("Error pausing Mailbox:", err);
    process.exit(1);
  }
})();
