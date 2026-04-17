import * as anchor from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { getBase58EncodedTxBytes } from "../utils";
import { RatioOracle } from "../../target/types/ratio_oracle";
import { getOraclePDA } from "./utils";

// Provide instructions.
if (process.argv.indexOf("--help") > -1) {
  console.log(`Usage: PROGRAM_ID=<program_id> ANCHOR_PROVIDER_URL=<rpc_url> ANCHOR_WALLET=<wallet_path> yarn gmp_createTokenOracle <demon> <mint address> <initial ratio> <switch time> <max agead interval> <ratio threshold>

    Creates the Token Oracle config. `);
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
const program = new anchor.Program(require("../../target/idl/ratio_oracle.json"), provider) as anchor.Program<RatioOracle>;

if (!program.programId.equals(programId)) {
  console.error("the program id in the idl does not match the program id passed as env variable");
  process.exit(1);
}

// If we have a populate flag at the end of the call, we return the bytes.
let populate = process.argv.at(-1) === "--populate";

const denom = process.argv[2];
const mint = new PublicKey(process.argv[3]);
const initalRatio = new anchor.BN(process.argv[4]);
const switchTime = new anchor.BN(process.argv[5]);
const maxAheadInterval = new anchor.BN(process.argv[6]);
const ratioThreshold = new anchor.BN(process.argv[7]);

(async () => {
  try {
    const admin = provider.wallet.publicKey; // Get wallet address

    // Derive PDA for oracle
    const oraclePDA = getOraclePDA(programId, denom);
    console.log("Using config PDA:", oraclePDA.toBase58());

    const tx = await program.methods.initializeOracle(denom, mint, initalRatio, switchTime, maxAheadInterval, ratioThreshold).accounts({
      payer: admin,
      oracle: oraclePDA,
    });

    if (populate) {
      console.log("Transaction bytes:", await getBase58EncodedTxBytes(await tx.instruction(), provider.connection));
    } else {
      console.log("Transaction Signature:", await tx.rpc());
    }
  } catch (err) {
    console.error("Error setting initial validator set:", err);
  }
})();
