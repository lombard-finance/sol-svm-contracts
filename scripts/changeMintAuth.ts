import * as anchor from "@coral-xyz/anchor";
import * as spl from "@solana/spl-token";
import { PublicKey } from "@solana/web3.js";
import { Lbtc } from "../target/types/lbtc";
import { sha256 } from "js-sha256";

// const provider = new anchor.AnchorProvider(new Connection("https://api.devnet.solana.com"), new anchor.Wallet(new Keypair))
const provider = anchor.AnchorProvider.env();
anchor.setProvider(provider);

const programId = new PublicKey("bardQVSt6HdZVAafMcSvk3WNHEMf3Sn16Zh6kKkw9jE"); // Your program ID
const mint = new PublicKey("1ompWcGTYv3w4TGT7NLGTC7cHG7S3ZCSGQrYsz84Zgk"); // Replace with mint address
const program = new anchor.Program(require("../target/idl/lbtc.json"), provider) as anchor.Program<Lbtc>;
const multisig = new PublicKey("C42NaT4xHchgJsNmxjH5ccLjUQ2gcLtxRk5MYqwqutCF");

const CONFIG_SEED = Buffer.from("lbtc_config"); // Seed for PDA derivation

(async () => {
  try {
    const payer = provider.wallet.publicKey; // Get wallet address
    const tokenAuth = PublicKey.findProgramAddressSync([Buffer.from("token_authority")], program.programId)[0];

    // Derive PDA for config
    const [configPDA] = PublicKey.findProgramAddressSync([CONFIG_SEED], programId);

    console.log("Initializing program with config PDA:", configPDA.toBase58());

    const tx = await program.methods
      .changeMintAuth(multisig)
      .accounts({
        payer,
        config: configPDA,
        tokenProgram: spl.TOKEN_PROGRAM_ID,
        mint: mint,
        tokenAuthority: tokenAuth,
        currentAuth: tokenAuth,
      })
      .rpc();

    console.log("Transaction Signature:", tx);
  } catch (err) {
    console.error("Error initializing program:", err);
  }
})();
