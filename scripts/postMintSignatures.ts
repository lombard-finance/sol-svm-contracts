import * as anchor from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { Lbtc } from "../target/types/lbtc";
import { sha256 } from "js-sha256";

// const provider = new anchor.AnchorProvider(new Connection("https://api.devnet.solana.com"), new anchor.Wallet(new Keypair))
const provider = anchor.AnchorProvider.env();
anchor.setProvider(provider);

const programId = new PublicKey("1omChwHpiCNdRVYYvsRNqktBvJsC7RJptbfaDZnDPuc"); // Your program ID
const program = new anchor.Program(require("../target/idl/lbtc.json"), provider) as anchor.Program<Lbtc>;

const CONFIG_SEED = Buffer.from("lbtc_config"); // Seed for PDA derivation

const mintPayload = Buffer.from(process.argv[2], "hex");
const signatures = process.argv[3].split(",").map(s => Buffer.from(s, "hex"));
const indices = process.argv[4].split(",").map(i => new anchor.BN(i));

(async () => {
  try {
    const payloadHash = Buffer.from(sha256(mintPayload), "hex");

    // Derive PDA for config
    const [configPDA] = PublicKey.findProgramAddressSync([CONFIG_SEED], programId);

    console.log("Initializing program with config PDA:", configPDA.toBase58());

    // Derive PDA for payload
    const [payloadPDA] = PublicKey.findProgramAddressSync([payloadHash], programId);

    console.log("Creating payload PDA for mint payload:", payloadPDA.toBase58());

    const tx = await program.methods
      .postMintSignatures(payloadHash, signatures, indices)
      .accounts({
        config: configPDA,
        payload: payloadPDA
      })
      .rpc();

    console.log("Transaction Signature:", tx);
  } catch (err) {
    console.error("Error initializing program:", err);
  }
})();
