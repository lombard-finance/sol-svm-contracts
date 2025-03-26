import * as anchor from "@coral-xyz/anchor";
import * as spl from "@solana/spl-token";
import { PublicKey } from "@solana/web3.js";
import { Lbtc } from "../target/types/lbtc";
import { sha256 } from "js-sha256";

// const provider = new anchor.AnchorProvider(new Connection("https://api.devnet.solana.com"), new anchor.Wallet(new Keypair))
const provider = anchor.AnchorProvider.env();
anchor.setProvider(provider);

if (!process.env.PROGRAM_ID) {
    console.error("no program Id set")
    process.exit(1)
}
const programId = new PublicKey(process.env.PROGRAM_ID);

const newAdmin = new PublicKey(process.argv[2]);

const program = new anchor.Program(require("../target/idl/lbtc.json"), provider) as anchor.Program<Lbtc>;

const CONFIG_SEED = Buffer.from("lbtc_config"); // Seed for PDA derivation

(async () => {
  try {
    const payer = provider.wallet.publicKey; // Get wallet address

    // Derive PDA for config
    const [configPDA] = PublicKey.findProgramAddressSync([CONFIG_SEED], programId);

    console.log("Initializing program with config PDA:", configPDA.toBase58());

    const tx = await program.methods
      .transferOwnership(newAdmin)
      .accounts({
        payer,
        config: configPDA
      })
      .rpc();

    console.log("Transaction Signature:", tx);
  } catch (err) {
    console.error("Error initializing program:", err);
  }
})();
