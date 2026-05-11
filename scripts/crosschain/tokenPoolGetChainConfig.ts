import * as anchor from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { getBase58EncodedTxBytes } from "../utils";
import { LombardTokenPool } from "../../target/types/lombard_token_pool";
import { getTokenPoolChainConfig, getTokenPoolState } from "./utils";

// Provide instructions.
if (process.argv.indexOf("--help") > -1) {
  console.log(`Usage: PROGRAM_ID=<program_id> ANCHOR_PROVIDER_URL=<rpc_url> ANCHOR_WALLET=<wallet_path> yarn crosschain_tokenPoolGetChainConfig <mint address> <remote chain selector>

    Initializes state config for the LombardTokenPool contract. `);
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
const program = new anchor.Program(require("../../target/idl/lombard_token_pool.json"), provider) as anchor.Program<LombardTokenPool>;

if (!program.programId.equals(programId)) {
  console.error("the program id in the idl does not match the program id passed as env variable");
  process.exit(1);
}

// If we have a populate flag at the end of the call, we return the bytes.
let populate = process.argv.at(-1) === "--populate";

const mint = new PublicKey(process.argv[2]);
const chainSelector = new anchor.BN(process.argv[3]);

(async () => {
  try {
    // const configPDA = getConfigPDA(programId);
    const statePDA = getTokenPoolState(mint, programId);
    const chainConfigPDA = getTokenPoolChainConfig(mint, chainSelector, programId);

    console.log(`Chain config PDA: ${chainConfigPDA.toBase58()}`);

    const config = await program.account.chainConfig.fetch(chainConfigPDA);
    console.log(`config contents: ${JSON.stringify(config)}`)
  } catch (err) {
    console.error("Error initializing LombardTokePool state config:", err);
  }
})();
