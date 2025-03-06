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
const METADATA_SEED = Buffer.from([
  1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1
]);

const valsetPayload = Buffer.from(process.argv[2], "hex");
const signatures = process.argv[3].split(",");
const indices = process.argv[4].split(",");

(async () => {
  try {
    const payer = provider.wallet.publicKey; // Get wallet address

    const payloadHash = sha256(valsetPayload);

    // Derive PDA for config
    const [configPDA] = PublicKey.findProgramAddressSync([CONFIG_SEED], programId);

    console.log("Initializing program with config PDA:", configPDA.toBase58());

    // Derive PDA for metadata
    const [metadataPDA] = PublicKey.findProgramAddressSync(
      [payloadHash, METADATA_SEED, payer.publicKey.toBuffer()],
      programId
    );

    console.log("Creating metadata PDA for valset payload:", metadataPDA.toBase58());

    // Derive PDA for payload
    const [payloadPDA] = PublicKey.findProgramAddressSync([payloadHash, payer.publicKey.toBuffer()], programId);

    console.log("Creating payload PDA for valset payload:", payloadPDA.toBase58());

    const tx = await program.methods
      .setNextValset(payloadHash)
      .accounts({
        payer,
        config: configPDA,
        metadata: metadataPDA,
        payload: payloadPDA
      })
      .rpc();

    console.log("Transaction Signature:", tx);
  } catch (err) {
    console.error("Error initializing program:", err);
  }
})();
