import * as anchor from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { Consortium } from "../../target/types/consortium";
import { getConsortiumConfigPDA } from "./utils";

function bytesToHex(bytes: Uint8Array | number[]) {
  return Buffer.from(bytes).toString("hex");
}

// Provide instructions.
if (process.argv.indexOf("--help") > -1) {
  console.log(`Usage: PROGRAM_ID=<consortium_program_id> ANCHOR_PROVIDER_URL=<rpc_url> ANCHOR_WALLET=<wallet_path> yarn gmp_getConsortiumConfig

    Prints current consortium config account data.`);
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
const program = new anchor.Program(require("../../target/idl/consortium.json"), provider) as anchor.Program<Consortium>;

if (!program.programId.equals(programId)) {
  console.error("the program id in the idl does not match the program id passed as env variable");
  process.exit(1);
}

(async () => {
  try {
    const configPDA = getConsortiumConfigPDA(programId);
    console.log("Using config PDA:", configPDA.toBase58());

    const data = await program.account.config.fetch(configPDA);

    console.log("admin:", data.admin.toBase58());
    console.log("pending admin:", data.pendingAdmin.toBase58());
    console.log("current epoch:", data.currentEpoch.toString());
    console.log("current weight threshold:", data.currentWeightThreshold.toString());
    console.log("current height:", data.currentHeight.toString());

    console.log("current validators:");
    data.currentValidators.forEach((validator, index) => {
      console.log(`${index}: ${bytesToHex(validator)}`);
    });

    console.log("current weights:");
    data.currentWeights.forEach((weight, index) => {
      console.log(`${index}: ${weight.toString()}`);
    });

    // Helpful full dump for debugging.
    console.log("raw data:", JSON.stringify(data));
  } catch (err) {
    console.error("Error getting consortium config:", err);
    process.exit(1);
  }
})();
