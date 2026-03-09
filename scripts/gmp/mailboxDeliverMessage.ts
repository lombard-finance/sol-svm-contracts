import * as anchor from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { getBase58EncodedTxBytes } from "../utils";
import { Mailbox } from "../../target/types/mailbox";
import { sha256 } from "js-sha256";
import { getConsortiumSessionPayloadPDA, getConsortiumValidatedPayloadPDA, getInboundMessagePathPDA } from "./utils";

// Provide instructions.
if (process.argv.indexOf("--help") > -1) {
  console.log(`Usage: PROGRAM_ID=<program_id> CONSORTIUM_PROGRAM_ID=<consotrium_program_id> ANCHOR_PROVIDER_URL=<rpc_url> ANCHOR_WALLET=<wallet_path> yarn gmp_mailboxDeliverMessage <payload> <from chain id>

    Delivers message to the Mailbox contract. `);
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

const consortiumIdl = require("../../target/idl/consortium.json");
const consortiumProgramId = process.env.CONSORTIUM_PROGRAM_ID
  ? new PublicKey(process.env.CONSORTIUM_PROGRAM_ID)
  : new PublicKey(consortiumIdl.address);

// If we have a populate flag at the end of the call, we return the bytes.
let populate = process.argv.at(-1) === "--populate";
const payloadBuf = Buffer.from(process.argv[2], "hex");
const payload = Array.from(Uint8Array.from(payloadBuf));
const payloadHashBuf = Buffer.from(sha256(payload), "hex");
const payloadHash = Array.from(Uint8Array.from(payloadHashBuf));
const fromChainId = Buffer.from(process.argv[3], "hex");

(async () => {
  try {
    const payer = provider.wallet.publicKey; // Get wallet address

    const msgPathPDA = getInboundMessagePathPDA(programId, fromChainId);
    const consortiumPayloadPDA = getConsortiumSessionPayloadPDA(consortiumProgramId, payer, payloadHashBuf);
    const consortiumValidatedPayloadPDA = getConsortiumValidatedPayloadPDA(consortiumProgramId, payloadHashBuf);

    const recipient = new PublicKey(payloadBuf.subarray(36, 68));

    const tx = await program.methods.deliverMessage(payloadHash).accounts({
      deliverer: payer,
      inboundMessagePath: msgPathPDA,
      consortiumPayload: consortiumPayloadPDA,
      consortiumValidatedPayload: consortiumValidatedPayloadPDA,
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
