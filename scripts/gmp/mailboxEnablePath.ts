import * as anchor from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { getBase58EncodedTxBytes } from "../utils";
import { Mailbox } from "../../target/types/mailbox";

// Provide instructions.
if (process.argv.indexOf("--help") > -1) {
  console.log(`Usage: PROGRAM_ID=<program_id> ANCHOR_PROVIDER_URL=<rpc_url> ANCHOR_WALLET=<wallet_path> yarn gmp_mailboxEnablePath <remote chain id> <remote mailbox> <direction: inbound|outbound|both>

    Enables Mailbox path contract. `);
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

const remoteChainId = Array.from(Uint8Array.from(Buffer.from(process.argv[2], "hex")));
const remoteMailbox = Array.from(Uint8Array.from(Buffer.from(process.argv[3], "hex")));
const direction = process.argv[4];

(async () => {
  try {
    const admin = provider.wallet.publicKey; // Get wallet address

    if (direction === "inbound" || direction === "both") {
      const tx = await program.methods.enableInboundMessagePath(remoteChainId, remoteMailbox).accounts({
        admin: admin,
      });

      if (populate) {
        console.log("Transaction bytes:", await getBase58EncodedTxBytes(await tx.instruction(), provider.connection));
      } else {
        console.log("Transaction Signature:", await tx.rpc());
      }
    }

    if (direction === "outbound" || direction === "both") {
      const tx = await program.methods.enableOutboundMessagePath(remoteChainId).accounts({
        admin: admin,
      });

      if (populate) {
        console.log("Transaction bytes:", await getBase58EncodedTxBytes(await tx.instruction(), provider.connection));
      } else {
        console.log("Transaction Signature:", await tx.rpc());
      }
    }

  } catch (err) {
    console.error("Error setting initial validator set:", err);
  }
})();
