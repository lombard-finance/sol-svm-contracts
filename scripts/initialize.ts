import * as anchor from "@coral-xyz/anchor";
import * as spl from "@solana/spl-token";
import { PublicKey } from "@solana/web3.js";
import { Lbtc } from "../target/types/lbtc";
import { getBase58EncodedTxBytes, getConfigPDA } from "./utils";

// Provide instructions.
if (process.argv.indexOf("--help") > -1) {
  console.log(`Usage: PROGRAM_ID=<program_id> ANCHOR_PROVIDER_URL=<rpc_url> ANCHOR_WALLET=<wallet_path> yarn initialize <admin> <mint> <treasury> <burn_commission> <dust_fee_rate> <mint_fee>

    Initializes the LBTC contract. Note that we just take the standard Solana public key for the treasury,
    and the script will generate an associated token account for it.`);
  process.exit(0);
}

const provider = anchor.AnchorProvider.env();
anchor.setProvider(provider);

// Check for program ID match.
if (!process.env.PROGRAM_ID) {
  console.error("no program Id set");
  process.exit(1);
}
const programId = new PublicKey(process.env.PROGRAM_ID);
const program = new anchor.Program(require("../target/idl/lbtc.json"), provider) as anchor.Program<Lbtc>;

if (!program.programId.equals(programId)) {
  console.error("the program id in the idl does not match the program id passed as env variable");
  process.exit(1);
}

// If we have a populate flag at the end of the call, we return the bytes.
let populate = process.argv.at(-1) === "--populate";

const admin = new anchor.BN(process.argv[2]);
const mint = new anchor.BN(process.argv[3]);
const treasuryHolder = new anchor.BN(process.argv[4]);
const burnCommission = new anchor.BN(process.argv[5]);
const dustFeeRate = new anchor.BN(process.argv[6]);
const mintFee = new anchor.BN(process.argv[7]);

(async () => {
  try {
    const payer = provider.wallet.publicKey; // Get wallet address

    const treasury = await spl.createAssociatedTokenAccount(provider.connection, provider.wallet, mint, treasuryHolder); // Generates an ATA for the treasury holder

    // Derive PDA for config
    const configPDA = getConfigPDA(programId);
    console.log("Using config PDA:", configPDA.toBase58());

    const tx = await program.methods.initialize(admin, burnCommission, dustFeeRate, mintFee).accounts({
      payer,
      mint,
      treasury
    });

    if (populate) {
      console.log("Transaction bytes:", await getBase58EncodedTxBytes(await tx.instruction(), provider.connection));
    } else {
      console.log("Transaction Signature:", await tx.rpc());
    }
  } catch (err) {
    console.error("Error initializing program:", err);
  }
})();
