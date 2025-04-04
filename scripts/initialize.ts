import * as anchor from "@coral-xyz/anchor";
import * as spl from "@solana/spl-token";
import { PublicKey } from "@solana/web3.js";
import { Lbtc } from "../target/types/lbtc";

// const provider = new anchor.AnchorProvider(new Connection("https://api.devnet.solana.com"), new anchor.Wallet(new Keypair))
const provider = anchor.AnchorProvider.env();
anchor.setProvider(provider);

const programId = new PublicKey("79cscM6J9Af24TGGWcXyDf56fDLoodkyXdVy4R9aZ6C6"); // Your program ID
const program = new anchor.Program(require("../target/idl/lbtc.json"), provider) as anchor.Program<Lbtc>;

const CONFIG_SEED = Buffer.from("lbtc_config"); // Seed for PDA derivation

const burnCommission = new anchor.BN(process.argv[2]);
const dustFeeRate = new anchor.BN(process.argv[3]);
const mintFee = new anchor.BN(process.argv[4]);

(async () => {
  try {
    const payer = provider.wallet.publicKey; // Get wallet address
    const admin = new PublicKey("HzCyQqcAoxAHeqHAWH1RQbfw7GNUzinqSWideGj7ZtEE"); // Replace with admin address
    const mint = new PublicKey("LBTCgU4b3wsFKsPwBn1rRZDx5DoFutM6RPiEt1TPDsY"); // Replace with mint address
    const treasury = await spl.createAssociatedTokenAccount(provider.connection, payer, mint, admin);

    // Derive PDA for config
    const [configPDA] = PublicKey.findProgramAddressSync([CONFIG_SEED], programId);

    console.log("Initializing program with config PDA:", configPDA.toBase58());

    const tx = await program.methods
      .initialize(admin, burnCommission, dustFeeRate, mintFee)
      .accounts({
        payer,
        mint,
        treasury
      })
      .rpc();

    console.log("Transaction Signature:", tx);
  } catch (err) {
    console.error("Error initializing program:", err);
  }
})();
