import * as anchor from "@coral-xyz/anchor";
import * as spl from "@solana/spl-token";
import { PublicKey } from "@solana/web3.js";
import { Bridge } from "../../target/types/bridge";
import { getBridgeConfigPDA, getBridgeLocalTokenConfigPDA } from "./utils";
import { getTokenAuthority } from "../utils";

// Provide instructions.
if (process.argv.indexOf("--help") > -1) {
  console.log(`Usage: PROGRAM_ID=<program_id> BRIDGE_PROGRAM_ID=<program_id> ANCHOR_PROVIDER_URL=<rpc_url> ANCHOR_WALLET=<wallet_path> yarn crosschain_bridgeGetConfigs <mint>

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

(async () => {
  try {
    const admin = provider.wallet.publicKey; // Get wallet address
    const configPDA = getBridgeConfigPDA(programId);

    console.log(`Bridge config PDA: ${configPDA.toBase58()}`);

    const config = await program.account.config.fetch(configPDA);
    console.log(`config contents: ${JSON.stringify(config)}`)
 
    const localTokenConfigPDA = getBridgeLocalTokenConfigPDA(mint, programId);

    console.log(`Bridge local token config PDA: ${localTokenConfigPDA.toBase58()}`);

    const localaTokenConfig = await program.account.localTokenConfig.fetch(localTokenConfigPDA);
    console.log(`local token config contents: ${JSON.stringify(localaTokenConfig)}`)

    
  } catch (err) {
    console.error("Error getting configs:", err);
  }

  const mintAccountInfo = await provider.connection.getAccountInfo(mint);
  if (!mintAccountInfo) {
    throw new Error(`mint account not found: ${mint.toBase58()}`);
  }
  const tokenProgram = mintAccountInfo.owner;
  const mintAccount = await spl.getMint(provider.connection, mint, undefined, tokenProgram);
  const mintAuthority = mintAccount.mintAuthority;
  if (!mintAuthority) {
    throw new Error("mint has no mint authority");
  }
  const bTokenAuthority = getTokenAuthority(programId)
  console.log("Token program:", tokenProgram.toBase58());
  console.log("Mint:", mint.toBase58());
  console.log("Mint authority:", mintAuthority.toBase58());
  console.log("Bridge token authority:", bTokenAuthority.toBase58());

})();
