import * as anchor from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { Lbtc } from "../target/types/lbtc";
import { sha256 } from "js-sha256";
import { getBase58EncodedTxBytes, getMetadataPDA } from "./utils";

// Provide instructions.
if (process.argv.indexOf("--help") > -1) {
  console.log(`Usage: PROGRAM_ID=<program_id> ANCHOR_PROVIDER_URL=<rpc_url> ANCHOR_WALLET=<wallet_path> yarn postMetadata <valset_payload> <validators> <weights>

    Adds validators and weights to a <valset_payload>.
    Note that <validators> and <weights> are expected to be comma-separated.`);
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
const program = new anchor.Program(require("../target/idl/lbtc.json"), provider) as anchor.Program<Lbtc>;

if (!program.programId.equals(programId)) {
  console.error("the program id in the idl does not match the program id passed as env variable");
  process.exit(1);
}

// If we have a populate flag at the end of the call, we return the bytes.
let populate = process.argv.at(-1) === "--populate";

const valsetPayload = Buffer.from(process.argv[2], "hex");
const validators = process.argv[3].split(",").map(v => Buffer.from(v, "hex"));
const weights = process.argv[4].split(",").map(w => new anchor.BN(w));

(async () => {
  try {
    const payer = provider.wallet.publicKey; // Get wallet address

    const payloadHash = Buffer.from(sha256(valsetPayload), "hex");

    // Derive PDA for metadata
    const metadataPDA = getMetadataPDA(payloadHash, payer, programId);
    console.log("Creating metadata PDA:", metadataPDA.toBase58());

    const tx = await program.methods.postMetadataForValsetPayload(validators, weights).accounts({
      payer,
      metadata: metadataPDA
    });

    if (populate) {
      console.log("Transaction bytes:", await getBase58EncodedTxBytes(await tx.instruction(), provider.connection));
    } else {
      console.log("Transaction Signature:", await tx.rpc());
    }
  } catch (err) {
    console.error("Error posting metadata:", err);
  }
})();
