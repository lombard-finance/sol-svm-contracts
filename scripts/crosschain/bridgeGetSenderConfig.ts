import * as anchor from "@coral-xyz/anchor";
import * as spl from "@solana/spl-token";
import { PublicKey } from "@solana/web3.js";
import { Bridge } from "../../target/types/bridge";
import { getBridgeConfigPDA, getBridgeLocalTokenConfigPDA, getBridgeSenderConfigPDA } from "./utils";
import { getTokenAuthority } from "../utils";

// Provide instructions.
if (process.argv.indexOf("--help") > -1) {
  console.log(`Usage: PROGRAM_ID=<program_id> ANCHOR_PROVIDER_URL=<rpc_url> yarn crosschain_bridgeGetSenderConfig <sender address>

    Returns sender's config on bridge. `);
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
const program = new anchor.Program(require("../../target/idl/bridge.json"), provider) as anchor.Program<Bridge>;

if (!program.programId.equals(programId)) {
  console.error("the program id in the idl does not match the program id passed as env variable");
  process.exit(1);
}

const sender = new PublicKey(process.argv[2]);

(async () => {
  try {
    const senderConfigPDA = getBridgeSenderConfigPDA(sender, programId);

    console.log(`Bridge sender config PDA: ${senderConfigPDA.toBase58()}`);

    const senderConfig = await program.account.senderConfig.fetch(senderConfigPDA);
    console.log(`config contents: ${JSON.stringify(senderConfig)}`)   
  } catch (err) {
    console.error("Error getting configs:", err);
  }
})();
