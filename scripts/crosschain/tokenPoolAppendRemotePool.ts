import * as anchor from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { getBase58EncodedTxBytes } from "../utils";
import { LombardTokenPool } from "../../target/types/lombard_token_pool";
import { getTokenPoolChainConfig, getTokenPoolState } from "./utils";

// Provide instructions.
if (process.argv.indexOf("--help") > -1) {
  console.log(`Usage: PROGRAM_ID=<program_id> ANCHOR_PROVIDER_URL=<rpc_url> ANCHOR_WALLET=<wallet_path> yarn crosschain_tokenPoolAppendRemotePool <mint address> <remote chain selector> <remote token pool address> [--populate]

    Appends information about remote token pool the LombardTokenPool chain config. `);
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
const remoteTokenPool = Buffer.from(process.argv[4], "hex");

(async () => {
  try {
    const deployer = provider.wallet.publicKey; // Get wallet address

    // const configPDA = getConfigPDA(programId);
    const statePDA = getTokenPoolState(mint, programId);
    const chainConfigPDA = getTokenPoolChainConfig(mint, chainSelector, programId);

    const tx = await program.methods
      .appendRemotePoolAddresses(chainSelector, mint, [{address: remoteTokenPool}])
      .accountsPartial({
        state: statePDA,
        chainConfig: chainConfigPDA,
        authority: deployer,
      });

    if (populate) {
      console.log("Transaction bytes:", await getBase58EncodedTxBytes(await tx.instruction(), provider.connection));
    } else {
      console.log("Transaction Signature:", await tx.rpc());
    }
  } catch (err) {
    console.error("Error initializing LombardTokePool state config:", err);
  }
})();
