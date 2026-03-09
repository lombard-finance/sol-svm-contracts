import * as anchor from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { Consortium } from "../../target/types/consortium";
import { getBase58EncodedTxBytes } from "../utils";
import { sha256 } from "js-sha256";
import { getConsortiumSessionPDA, getConsortiumValidatedPayloadPDA } from "./utils";

// Provide instructions.
if (process.argv.indexOf("--help") > -1) {
  console.log(`Usage: PROGRAM_ID=<program_id> ANCHOR_PROVIDER_URL=<rpc_url> ANCHOR_WALLET=<wallet_path> yarn gmp_consortiumFinalizeSession <payload>

    Initializes the Consortium contract. `);
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

// If we have a populate flag at the end of the call, we return the bytes.
let populate = process.argv.at(-1) === "--populate";
const payload = Array.from(Uint8Array.from(Buffer.from(process.argv[2], "hex")));
const payloadHashBuf = Buffer.from(sha256(payload), "hex");
const payloadHash = Array.from(Uint8Array.from(payloadHashBuf));

(async () => {
  try {
    const payer = provider.wallet.publicKey; // Get wallet address

    // Derive PDA for session
    const sessionPDA = getConsortiumSessionPDA(programId, payer, payloadHashBuf);
    console.log("Using session PDA:", sessionPDA.toBase58());

    // Derive PDA for validatedPayload
    const validatedPayloadPDA = getConsortiumValidatedPayloadPDA(programId, payloadHashBuf);
    console.log("Using validated payload PDA:", validatedPayloadPDA.toBase58());

    const tx = await program.methods.finalizeSession(payloadHash).accounts({
      payer: payer,
      session: sessionPDA,
      validatedPayload:validatedPayloadPDA,
    });

    if (populate) {
      console.log("Transaction bytes:", await getBase58EncodedTxBytes(await tx.instruction(), provider.connection));
    } else {
      console.log("Transaction Signature:", await tx.rpc());
    }
  } catch (err) {
    console.error("Error creating new session:", err);
  }
})();
