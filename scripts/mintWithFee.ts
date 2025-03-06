import * as anchor from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import { Lbtc } from "../target/types/lbtc";
import { sha256 } from "js-sha256";

// const provider = new anchor.AnchorProvider(new Connection("https://api.devnet.solana.com"), new anchor.Wallet(new Keypair))
const provider = anchor.AnchorProvider.env();
anchor.setProvider(provider);

const programId = new PublicKey("1omChwHpiCNdRVYYvsRNqktBvJsC7RJptbfaDZnDPuc"); // Your program ID
const program = new anchor.Program(require("../target/idl/lbtc.json"), provider) as anchor.Program<Lbtc>;

const CONFIG_SEED = Buffer.from("lbtc_config"); // Seed for PDA derivation

const mintPayload = Buffer.from(process.argv[2], "hex");
const signatures = process.argv[3].split(",");
const indices = process.argv[4].split(",");
const recipient = anchor.PublicKey.newPublicKey(process.argv[5]);
const feePayload = Buffer.from(process.argv[6], "hex");
const feeSignature = Buffer.from(process.argv[7], "hex");

(async () => {
  try {
    const payer = provider.wallet.publicKey; // Get wallet address
    const mint = new PublicKey("1btcBkoWqDRFupvSp6ujkCnFb3nP5RckTJZ6Y1Sr7Tt"); // Replace with mint address
    const tokenAuth = web3.PublicKey.findProgramAddressSync([Buffer.from("token_authority")], program.programId)[0];
    const recipientTA = await spl.createAssociatedTokenAccount(
      provider.connection,
      recipient,
      mint,
      recipient.publicKey
    );

    const payloadHash = sha256(mintPayload);

    // Derive PDA for config
    const [configPDA] = PublicKey.findProgramAddressSync([CONFIG_SEED], programId);

    console.log("Initializing program with config PDA:", configPDA.toBase58());

    // Derive PDA for payload
    const [payloadPDA] = PublicKey.findProgramAddressSync([payloadHash], programId);

    console.log("Creating payload PDA for mint payload:", payloadPDA.toBase58());

    const tx = await program.methods
      .mintFromPayload(payloadHash, feePayload, feeSignature)
      .accounts({
        payer,
        config: configPDA,
        tokenProgram: spl.TOKEN_PROGRAM_ID,
        recipient: recipientTA,
        mint: mint,
        tokenAuthority: tokenAuth,
        payload: payloadPDA,
        bascule: payer.publicKey
      })
      .rpc();

    console.log("Transaction Signature:", tx);
  } catch (err) {
    console.error("Error initializing program:", err);
  }
})();
