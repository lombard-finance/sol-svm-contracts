import * as anchor from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { Consortium } from "../../target/types/consortium";
import { getBase58EncodedTxBytes } from "../utils";
import { sha256 } from "js-sha256";
import { convertToBuf, convertToRS, getConsortiumConfigPDA, getConsortiumSessionPDA } from "./utils";
import {ASN1} from "@lapo/asn1js";
import { hexlify } from "ethers";

// Provide instructions.
if (process.argv.indexOf("--help") > -1) {
  console.log(`Usage: PROGRAM_ID=<program_id> ANCHOR_PROVIDER_URL=<rpc_url> ANCHOR_WALLET=<wallet_path> yarn gmp_consortiumPostSignatures <payload> <signatures> <indices> <sig encoding: der|hex> [--base64-payload|--hex-payload] [--populate|--send]

    Posts signatures to the session already created on Consortium contract. `);
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
let payload = Array.from(Uint8Array.from(convertToBuf(process.argv[2])));
const payloadHashBuf = Buffer.from(sha256(payload), "hex");
const payloadHash = Array.from(Uint8Array.from(payloadHashBuf));
const indices = process.argv[4].split(",").map(i => new anchor.BN(i));
let sigsInDerFormat = process.argv.at(5) === "der";

(async () => {
  try {
    const payer = provider.wallet.publicKey; // Get wallet address

    // Derive PDA for session
    const configPDA = getConsortiumConfigPDA(programId);
    const cfg = await program.account.config.fetch(configPDA);
    const currentEpoch = cfg.currentEpoch
    const sessionPDA = getConsortiumSessionPDA(programId, payer, payloadHashBuf, currentEpoch);
    console.log("Using session PDA:", sessionPDA.toBase58());

    let signatures = []
    if (sigsInDerFormat) {
      signatures = process.argv[3].split(",").map(s => convertToRS(Buffer.from(s, "base64")));
      console.log(`sigs:`);
      signatures.forEach(s => console.log(`${hexlify(s)}`));
    } else {
      signatures = process.argv[3].split(",").map(s => Buffer.from(s, "hex"));
    }

    const tx = await program.methods.postSessionSignatures(payloadHash, signatures, indices).accounts({
      payer: payer,
      session: sessionPDA,
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
