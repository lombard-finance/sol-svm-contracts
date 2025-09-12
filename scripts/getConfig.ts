import * as anchor from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { Lbtc } from "../target/types/lbtc";
import { getConfigPDA } from "./utils";

const byteToHex = byte => {
  const key = "0123456789abcdef";
  let bytes = new Uint8Array(byte);
  let newHex = "";
  let currentChar = 0;
  for (let i = 0; i < bytes.length; i++) {
    // Go over each 8-bit byte
    currentChar = bytes[i] >> 4; // First 4-bits for first hex char
    newHex += key[currentChar]; // Add first hex char to string
    currentChar = bytes[i] & 15; // Erase first 4-bits, get last 4-bits for second hex char
    newHex += key[currentChar]; // Add second hex char to string
  }
  return newHex;
};

// Provide instructions.
if (process.argv.indexOf("--help") > -1) {
  console.log(`Usage: PROGRAM_ID=<program_id> ANCHOR_PROVIDER_URL=<rpc_url> ANCHOR_WALLET=<wallet_path> yarn getConfig

    Gets current program config.`);
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

(async () => {
  try {
    // Derive PDA for config
    const configPDA = getConfigPDA(programId);
    console.log("Using config PDA:", configPDA.toBase58());

    const data = await program.account.config.fetch(configPDA);
    console.log("data: " + JSON.stringify(data));
    console.log("epoch:" + data.epoch.toString());
    console.log("weight threshold:" + data.weightThreshold.toString());
    console.log("validators:");
    data.validators.forEach(element => {
      console.log(byteToHex(element));
    });
    console.log("weights:");
    data.weights.forEach(element => {
      console.log(element);
    });
  } catch (err) {
    console.error("Error getting config:", err);
  }
})();
