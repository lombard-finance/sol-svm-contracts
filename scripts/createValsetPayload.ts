import * as anchor from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { Lbtc } from "../target/types/lbtc";
import { sha256 } from "js-sha256";
import { getBase58EncodedTxBytes, getConfigPDA, getMetadataPDA, getValsetPayloadPDA } from "./utils";

// Provide instructions.
if (process.argv.indexOf("--help") > -1) {
  console.log(`Usage: PROGRAM_ID=<program_id> ANCHOR_PROVIDER_URL=<rpc_url> ANCHOR_WALLET=<wallet_path> yarn createValsetPayload <valset_payload> <epoch> <weight_treshold> <height>

    Finalizes creation of a valset payload with the given <epoch>, <weight_threshold> and <height>.
    Note that a fully populated metadata PDA needs to exist for this to work.`);
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
const epoch = new anchor.BN(process.argv[3]);
const weightThreshold = new anchor.BN(process.argv[4]);
const height = new anchor.BN(process.argv[5]);

(async () => {
  try {
    const payer = provider.wallet.publicKey; // Get wallet address

    const payloadHash = Buffer.from(sha256(valsetPayload), "hex");

    // Derive PDA for config
    const configPDA = getConfigPDA(programId);
    console.log("Using config PDA:", configPDA.toBase58());

    // Derive PDA for metadata
    const metadataPDA = getMetadataPDA(payloadHash, payer, programId);
    console.log("Creating metadata PDA:", metadataPDA.toBase58());

    // Derive PDA for payload
    const payloadPDA = getValsetPayloadPDA(payloadHash, payer, programId);
    console.log("Creating payload PDA for valset payload:", payloadPDA.toBase58());

    const tx = await program.methods.createValsetPayload(epoch, weightThreshold, height).accounts({
      payer,
      config: configPDA,
      metadata: metadataPDA,
      payload: payloadPDA
    });

    if (populate) {
      console.log("Transaction bytes:", await getBase58EncodedTxBytes(await tx.instruction(), provider.connection));
    } else {
      console.log("Transaction Signature:", await tx.rpc());
    }
  } catch (err) {
    console.error("Error creating valset payload:", err);
  }
})();
