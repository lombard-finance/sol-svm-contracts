import * as anchor from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { getBase58EncodedTxBytes } from "../utils";
import { Bridge } from "../../target/types/bridge";
import { getBridgeRemoteTokenConfigPDA } from "./utils";

// Provide instructions.
if (process.argv.indexOf("--help") > -1) {
  console.log(`Usage: PROGRAM_ID=<program_id> ANCHOR_PROVIDER_URL=<rpc_url> ANCHOR_WALLET=<wallet_path> yarn crosschain_bridgeSetRateLimit <admin> <mint> <chain id> <enabled> <inbound capacity> <inbound rate> [--populate]

    Sets local token config on the bridge. `);
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

// If we have a populate flag at the end of the call, we return the bytes.
let populate = process.argv.at(-1) === "--populate";

const admin = new PublicKey(process.argv[2]);
const mint = new PublicKey(process.argv[3]);
const remoteChainId = Buffer.from(process.argv[4], "hex");
const enabled = process.argv[5].toLocaleLowerCase() === 'true';
const capacity = new anchor.BN(process.argv[6]);
const rate = new anchor.BN(process.argv[7]);

const remoteChainIdBytes = Array.from(Uint8Array.from(remoteChainId));

(async () => {
  try {
    const remoteTokenConfigPDA = getBridgeRemoteTokenConfigPDA(mint, remoteChainId, programId);

    const tx = await program.methods
			.setRateLimit(mint, remoteChainIdBytes, {
        enabled,
        capacity,
        rate 
      })
			.accounts({
        admin: admin,
        // remoteTokenConfig: remoteTokenConfigPDA,
			});

    if (populate) {
      console.log("Transaction bytes:", await getBase58EncodedTxBytes(await tx.instruction(), provider.connection));
    } else {
      console.log("Transaction Signature:", await tx.rpc());
    }
  } catch (err) {
    console.error("Error initializing bridge:", err);
  }
})();
