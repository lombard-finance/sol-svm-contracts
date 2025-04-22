import * as anchor from "@coral-xyz/anchor";
import * as spl from "@solana/spl-token";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { Lbtc } from "../target/types/lbtc";
import { getBase58EncodedTxBytes, getTokenAuthority, getConfigPDA } from "./utils";

// Provide instructions.
if (process.argv.indexOf("--help") > -1) {
  console.log(`Usage: PROGRAM_ID=<program_id> ANCHOR_PROVIDER_URL=<rpc_url> ANCHOR_WALLET=<wallet_path> yarn createTokenMetadata

    Sets up the token metadata for the LBTC token.`);
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

(async () => {
  try {
    const payer = provider.wallet.publicKey; // Get wallet address

    // Derive PDA for token authority
    const tokenAuthority = getTokenAuthority(programId);
    console.log("Using token authority PDA:", tokenAuthority.toBase58());

    // Derive PDA for config
    const configPDA = getConfigPDA(programId);
    console.log("Using config PDA:", configPDA.toBase58());

    // NOTE: This is the same on all environments, so we can just hardcode it.
    const metadataProgram = new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");
    const metadataPda = PublicKey.findProgramAddressSync(
      [Buffer.from("metadata"), metadataProgram.toBuffer(), mint.toBuffer()],
      metadataProgram
    )[0];

    const tx = await program.methods.createMetadata().accounts({
      payer,
      config: configPDA,
      tokenProgram: spl.TOKEN_PROGRAM_ID,
      metadataProgram,
      metadataPda,
      mint: mint,
      mintAuthority: tokenAuth,
      tokenAuthority: tokenAuth,
      systemProgram: SystemProgram.programId,
      sysvarInstructions: new PublicKey("Sysvar1nstructions1111111111111111111111111")
    });

    if (populate) {
      console.log("Transaction bytes:", await getBase58EncodedTxBytes(await tx.instruction(), provider.connection));
    } else {
      console.log("Transaction Signature:", await tx.rpc());
    }
  } catch (err) {
    console.error("Error creating token metadata:", err);
  }
})();
