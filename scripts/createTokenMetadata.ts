import * as anchor from "@coral-xyz/anchor";
import * as spl from "@solana/spl-token";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { Lbtc } from "../target/types/lbtc";
import { sha256 } from "js-sha256";

// const provider = new anchor.AnchorProvider(new Connection("https://api.devnet.solana.com"), new anchor.Wallet(new Keypair))
const provider = anchor.AnchorProvider.env();
anchor.setProvider(provider);

const programId = new PublicKey("HEY7PCJe3GB27UWdopuYb1xDbB5SNtTcYPxRjntvfBSA"); // Your program ID
const mint = new PublicKey("1btcyoWK7d99iosES4eXQGhhooCscKGigV5wHfvzueX"); // Replace with mint address
const program = new anchor.Program(require("../target/idl/lbtc.json"), provider) as anchor.Program<Lbtc>;
const multisig = new PublicKey("GfYV1f1bR9vy41mSyQ8quxYbds121kijSBj5A3nG8oDQ");

const CONFIG_SEED = Buffer.from("lbtc_config"); // Seed for PDA derivation

(async () => {
  try {
    const payer = provider.wallet.publicKey; // Get wallet address
    const tokenAuth = PublicKey.findProgramAddressSync([Buffer.from("token_authority")], program.programId)[0];
    console.log(tokenAuth);

    // Derive PDA for config
    const [configPDA] = PublicKey.findProgramAddressSync([CONFIG_SEED], programId);

    console.log("Initializing program with config PDA:", configPDA.toBase58());
    const metadataProgram = new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");

    const [metadataPda] = PublicKey.findProgramAddressSync([Buffer.from("metadata"), metadataProgram.toBuffer(), mint.toBuffer()], metadataProgram);

    const tx = await program.methods
      .createMetadata()
      .accounts({
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
      })
      .rpc();

    console.log("Transaction Signature:", tx);
  } catch (err) {
    console.error("Error initializing program:", err);
  }
})();
