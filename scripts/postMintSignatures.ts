import * as anchor from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { Lbtc } from "../target/types/lbtc";
import { sha256 } from "js-sha256";
import { getBase58EncodedTxBytes, getConfigPDA, getMintPayloadPDA } from "./utils";

// Provide instructions.
if (process.argv.indexOf("--help") > -1) {
  console.log(`Usage: PROGRAM_ID=<program_id> ANCHOR_PROVIDER_URL=<rpc_url> ANCHOR_WALLET=<wallet_path> yarn postMintSignatures <mint_payload> <signatures> <indices>

    Adds signatures to a <mint_payload>.
    Note that <signatures> and <indices> are expected to be comma-separated.`);
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

const mintPayload = Buffer.from(process.argv[2], "hex");
const signatures = process.argv[3].split(",").map(s => Buffer.from(s, "hex"));
const indices = process.argv[4].split(",").map(i => new anchor.BN(i));

(async () => {
  try {
    const payloadHash = Buffer.from(sha256(mintPayload), "hex");

    // Derive PDA for config
    const configPDA = getConfigPDA(programId);
    console.log("Using config PDA:", configPDA.toBase58());

    // Derive PDA for payload
    const payloadPDA = getMintPayloadPDA(payloadHash, programId);
    console.log("Creating payload PDA for mint payload:", payloadPDA.toBase58());

    const tx = await program.methods.postMintSignatures(payloadHash, signatures, indices).accounts({
      config: configPDA,
      payload: payloadPDA
    });

    if (populate) {
      console.log("Transaction bytes:", await getBase58EncodedTxBytes(await tx.instruction(), provider.connection));
    } else {
      console.log("Transaction Signature:", await tx.rpc());
    }
  } catch (err) {
    console.error("Error posting mint signatures:", err);
  }
})();
