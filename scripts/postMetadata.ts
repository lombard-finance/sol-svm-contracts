import * as anchor from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { Lbtc } from "../target/types/lbtc";
import { sha256 } from "js-sha256";

// const provider = new anchor.AnchorProvider(new Connection("https://api.devnet.solana.com"), new anchor.Wallet(new Keypair))
const provider = anchor.AnchorProvider.env();
anchor.setProvider(provider);

const programId = new PublicKey("1omChwHpiCNdRVYYvsRNqktBvJsC7RJptbfaDZnDPuc"); // Your program ID
const program = new anchor.Program(require("../target/idl/lbtc.json"), provider) as anchor.Program<Lbtc>;

const METADATA_SEED = Buffer.from([
  1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1
]);

const valsetPayload = Buffer.from(process.argv[2], "hex");
const validators = process.argv[3].split(",").map(v => Buffer.from(v, "hex"));
const weights = process.argv[4].split(",").map(w => new anchor.BN(w));

(async () => {
  try {
    const payer = provider.wallet.publicKey; // Get wallet address

    const payloadHash = Buffer.from(sha256(valsetPayload), "hex");

    // Derive PDA for metadata
    const [metadataPDA] = PublicKey.findProgramAddressSync([payloadHash, METADATA_SEED, payer.toBuffer()], programId);

    console.log("Creating metadata PDA for valset payload:", metadataPDA.toBase58());

    const tx = await program.methods
      .postMetadataForValsetPayload(validators, weights)
      .accounts({
        payer: payer,
        metadata: metadataPDA
      })
      .rpc();

    console.log("Transaction Signature:", tx);
  } catch (err) {
    console.error("Error initializing program:", err);
  }
})();
