import * as anchor from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { Consortium } from "../../target/types/consortium";
import { sha256 } from "js-sha256";
import { getBase58EncodedTxBytes, getMetadataPDA, getValsetPayloadPDA } from "../utils";
import { convertToBuf, getConsortiumConfigPDA, getConsortiumSessionPayloadPDA } from "./utils";

// Provide instructions.
if (process.argv.indexOf("--help") > -1) {
  console.log(`Usage: PROGRAM_ID=<program_id> ANCHOR_PROVIDER_URL=<rpc_url> ANCHOR_WALLET=<wallet_path> yarn gmp_setInitialValidatorSetFromSession <valset_payload>

    Sets the initial validator set on the Consortium program using previously posted payload session.`);
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

let valsetPayload = convertToBuf(process.argv[2]);
const payloadHashBuf = Buffer.from(sha256(valsetPayload), "hex");
const payloadHash = Array.from(Uint8Array.from(payloadHashBuf));

(async () => {
  try {
    const admin = provider.wallet.publicKey; // Get wallet address

    // Derive PDA for config
    const configPDA = getConsortiumConfigPDA(programId);
    console.log("Using config PDA:", configPDA.toBase58());
    const consortiumPayloadPDA = getConsortiumSessionPayloadPDA(programId, admin, payloadHashBuf);

    const tx = await program.methods.setInitialValsetFromSession(payloadHash).accounts({
      admin: admin,
      sessionPayload: consortiumPayloadPDA,
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
