import * as anchor from "@coral-xyz/anchor";
import * as spl from "@solana/spl-token";
import { PublicKey } from "@solana/web3.js";
import { Bridge } from "../../target/types/bridge";
import { getBridgeConfigPDA, getBridgeLocalTokenConfigPDA, getBridgeRemoteTokenConfigPDA } from "./utils";
import { getTokenAuthority } from "../utils";

// Provide instructions.
if (process.argv.indexOf("--help") > -1) {
  console.log(`Usage: PROGRAM_ID=<program_id> BRIDGE_PROGRAM_ID=<program_id> ANCHOR_PROVIDER_URL=<rpc_url> ANCHOR_WALLET=<wallet_path> yarn crosschain_bridgeGetRemoteTokenConfig <mint address>  <remote chain id>

    Returns current bridge cobnfig. `);
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

const mint = new PublicKey(process.argv[2]);
const remoteChainId = Buffer.from(process.argv[3], "hex");

(async () => {
  try {
    // const localTokenConfigPDA = getBridgeLocalTokenConfigPDA(mint, programId);
    // console.log(`Bridge local token config PDA: ${localTokenConfigPDA.toBase58()}`);

    // const localTokenConfig = await program.account.localTokenConfig.fetch(localTokenConfigPDA);
    // console.log(`local token config contents: ${JSON.stringify(localTokenConfig)}`)

    const remoteTokenConfigPDA = getBridgeRemoteTokenConfigPDA(mint, remoteChainId, programId);
    console.log(`Bridge remote token config PDA: ${remoteTokenConfigPDA.toBase58()}`);

    const remoteTokenConfig = await program.account.remoteTokenConfig.fetch(remoteTokenConfigPDA);
    console.log(`remote token config contents: ${JSON.stringify(remoteTokenConfig)}`)
    
  } catch (err) {
    console.error("Error getting configs:", err);
  }
})();
