import * as anchor from "@coral-xyz/anchor";
import * as spl from "@solana/spl-token";
import { PublicKey } from "@solana/web3.js";
import { Lbtc } from "../target/types/lbtc";
import { sha256 } from "js-sha256";

// const provider = new anchor.AnchorProvider(new Connection("https://api.devnet.solana.com"), new anchor.Wallet(new Keypair))
const provider = anchor.AnchorProvider.env();
anchor.setProvider(provider);

const programId = new PublicKey("1omChwHpiCNdRVYYvsRNqktBvJsC7RJptbfaDZnDPuc"); // Your program ID
const mint = new PublicKey("1btcBkoWqDRFupvSp6ujkCnFb3nP5RckTJZ6Y1Sr7Tt"); // Replace with mint address
const program = new anchor.Program(require("../target/idl/lbtc.json"), provider) as anchor.Program<Lbtc>;

const CONFIG_SEED = Buffer.from("lbtc_config"); // Seed for PDA derivation

const scriptPubkey = Buffer.from(process.argv[2], "hex");
const amount = new anchor.BN(process.argv[3]);
const treasury = new PublicKey(process.argv[4]); // this could be retrieved from config account

(async () => {
  try {
    const payer = provider.wallet.publicKey; // Get wallet address

    const unstakerTA = await spl.getAssociatedTokenAddress(mint, payer, false, spl.TOKEN_2022_PROGRAM_ID);

    console.log(`Unstaker Token Account: ${unstakerTA.toBase58()}`)

    // Derive PDA for config
    const [configPDA] = PublicKey.findProgramAddressSync([CONFIG_SEED], programId);

    console.log("Using program with config PDA:", configPDA.toBase58());

    const tx = await program.methods
      .redeem(scriptPubkey, amount)
      .accounts({
        payer: payer,
        holder: unstakerTA,
        config: configPDA,
        tokenProgram: spl.TOKEN_2022_PROGRAM_ID,
        mint: mint,
        treasury: treasury
      })
      .rpc();

    console.log("Transaction Signature:", tx);
  } catch (err) {
    console.error("Error initializing program:", err);
  }
})();
