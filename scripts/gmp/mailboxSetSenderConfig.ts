import * as anchor from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { getBase58EncodedTxBytes } from "../utils";
import { Mailbox } from "../../target/types/mailbox";

// Provide instructions.
if (process.argv.indexOf("--help") > -1) {
  console.log(`Usage: PROGRAM_ID=<program_id> ANCHOR_PROVIDER_URL=<rpc_url> ANCHOR_WALLET=<wallet_path> yarn gmp_mailboxSetSenderConfig <sender address> <max payload size> [--disable-fee]

    Sets sender config on the Mailbox contract. `);
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
let feeDisabled = process.argv.at(-2) === "--disable-fee";

const sender = new PublicKey(process.argv[2]);
const maxPayload =  Number(process.argv[3]);

(async () => {
  try {
    const admin = provider.wallet.publicKey; // Get wallet address

    const tx = await program.methods.setSenderConfig(sender, maxPayload, feeDisabled).accounts({
      admin: admin,
    });

    if (populate) {
      console.log("Transaction bytes:", await getBase58EncodedTxBytes(await tx.instruction(), provider.connection));
    } else {
      console.log("Transaction Signature:", await tx.rpc());
    }
  } catch (err) {
    console.error("Error setting initial validator set:", err);
  }
})();
