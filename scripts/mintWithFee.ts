import * as anchor from "@coral-xyz/anchor";
import * as spl from "@solana/spl-token";
import { PublicKey } from "@solana/web3.js";
import { Lbtc } from "../target/types/lbtc";
import { sha256 } from "js-sha256";
import { getBase58EncodedTxBytes, getConfigPDA, getMintPayloadPDA } from "./utils";

// Provide instructions.
if (process.argv.indexOf("--help") > -1) {
  console.log(`Usage: PROGRAM_ID=<program_id> ANCHOR_PROVIDER_URL=<rpc_url> ANCHOR_WALLET=<wallet_path> yarn mintWithFee <mint_payload> <recipient>

    Mints the LBTC contained in <mint_payload> to <recipient>, sending a fee to the Lombard treasury.`);
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
const recipient = new PublicKey(process.argv[3]);
const feePayload = Buffer.from(process.argv[4], "hex");
const feeSignature = Buffer.from(process.argv[5], "hex");

(async () => {
  try {
    const payer = provider.wallet.publicKey; // Get wallet address

    // Derive PDA for token authority
    const tokenAuthority = getTokenAuthority(programId);
    console.log("Using token authority PDA:", tokenAuthority.toBase58());

    const payloadHash = Buffer.from(sha256(mintPayload), "hex");

    // Derive PDA for config
    const configPDA = getConfigPDA(programId);
    console.log("Using config PDA:", configPDA.toBase58());

    // Derive PDA for payload
    const payloadPDA = getMintPayloadPDA(payloadHash, programId);
    console.log("Creating payload PDA for mint payload:", payloadPDA.toBase58());

    // Retrieve LBTC mint
    const cfg = await program.account.config.fetch(configPDA);
    const mint = cfg.mint;

    // Get current authority
    // Hardcoded on base SPL token
    const mintAccount = await spl.getMint(provider.connection, mint, undefined, spl.TOKEN_PROGRAM_ID);
    const mintAuthority = mintAccount.mintAuthority;

    let bascule = null;
    let basculeData = null;
    let deposit = null;
    if (cfg.basculeEnabled) {
      // TODO set bascule stuff
    }

    const tx = await program.methods.mintWithFee(payloadHash, feePayload, feeSignature).accounts({
      payer,
      config: configPDA,
      tokenProgram: spl.TOKEN_PROGRAM_ID,
      recipient,
      mint,
      mintAuthority,
      tokenAuthority,
      treasury: cfg.treasury,
      payload: payloadPDA,
      bascule,
      basculeData,
      deposit
    });

    if (populate) {
      console.log("Transaction bytes:", await getBase58EncodedTxBytes(await tx.instruction(), provider.connection));
    } else {
      console.log("Transaction Signature:", await tx.rpc());
    }
  } catch (err) {
    console.error("Error minting from payload:", err);
  }
})();
