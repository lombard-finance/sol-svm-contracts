import * as anchor from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { getBase58EncodedTxBytes } from "../utils";
import { LombardTokenPool } from "../../target/types/lombard_token_pool";
import { getTokenPoolChainConfig, getTokenPoolState } from "./utils";

// Provide instructions.
if (process.argv.indexOf("--help") > -1) {
  console.log(`Usage: PROGRAM_ID=<program_id> ANCHOR_PROVIDER_URL=<rpc_url> ANCHOR_WALLET=<wallet_path> yarn crosschain_tokenPoolSetRateLimits <admin> <mint address> <remote chain selector> <inbound enabled> <inbound capacity> <inbound rate> <outbound enabled> <outbound capacity> <outbound rate> [--populate]

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

const admin = new PublicKey(process.argv[2]);
const mint = new PublicKey(process.argv[3]);
const chainSelector = new anchor.BN(process.argv[4]);
const inboundEnabled = process.argv[5].toLocaleLowerCase() === 'true';
const inboundCapacity = new anchor.BN(process.argv[6]);
const inboundRate = new anchor.BN(process.argv[7]);
const outboundEnabled = process.argv[8].toLocaleLowerCase() === 'true';
const outboundCapacity = new anchor.BN(process.argv[9]);
const outboundRate = new anchor.BN(process.argv[10]);

(async () => {
  try {
    // const configPDA = getConfigPDA(programId);
    const statePDA = getTokenPoolState(mint, programId);
    const chainConfigPDA = getTokenPoolChainConfig(mint, chainSelector, programId);

    const tx = await program.methods
      .setChainRateLimit(chainSelector, mint,
        {
          enabled: inboundEnabled,
          capacity: inboundCapacity,
          rate: inboundRate
        },
        {
          enabled: outboundEnabled,
          capacity: outboundCapacity,
          rate: outboundRate
        }
      )
      .accountsPartial({
        state: statePDA,
        chainConfig: chainConfigPDA,
        authority: admin,
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
