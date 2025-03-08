import * as anchor from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { Lbtc } from "../target/types/lbtc";

// const provider = new anchor.AnchorProvider(new Connection("https://api.devnet.solana.com"), new anchor.Wallet(new Keypair))
const provider = anchor.AnchorProvider.env();
anchor.setProvider(provider);

const programId = new PublicKey("1omChwHpiCNdRVYYvsRNqktBvJsC7RJptbfaDZnDPuc"); // Your program ID
const program = new anchor.Program(require("../target/idl/lbtc.json"), provider) as anchor.Program<Lbtc>;

const CONFIG_SEED = Buffer.from("lbtc_config"); // Seed for PDA derivation

(async () => {
  try {
    const payer = provider.wallet.publicKey; // Get wallet address
    const admin = new PublicKey("1oms3mdU4H9qiKrrX5pzc6Lcj42jmDXuuYpiegdBKYy"); // Replace with admin address
    const mint = new PublicKey("1btcBkoWqDRFupvSp6ujkCnFb3nP5RckTJZ6Y1Sr7Tt"); // Replace with mint address

    // Derive PDA for config
    const [configPDA] = PublicKey.findProgramAddressSync([CONFIG_SEED], programId);

    console.log("Initializing program with config PDA:", configPDA.toBase58());

    const tx = await program.methods
      .initialize(admin, mint)
      .accounts({
        payer
      })
      .rpc();

    console.log("Transaction Signature:", tx);
  } catch (err) {
    console.error("Error initializing program:", err);
  }
})();
