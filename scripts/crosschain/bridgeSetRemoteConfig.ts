import * as anchor from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { getBase58EncodedTxBytes } from "../utils";
import { Bridge } from "../../target/types/bridge";

// Provide instructions.
if (process.argv.indexOf("--help") > -1) {
  console.log(`Usage: PROGRAM_ID=<program_id> ANCHOR_PROVIDER_URL=<rpc_url> ANCHOR_WALLET=<wallet_path> yarn crosschain_bridgeSetRemoteConfig <remote chain id> <remote bridge address> [--populate]

    Sets remote bridge config (information about remote chain id and bridge address). `);
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

const remoteChainId = Array.from(Uint8Array.from(Buffer.from(process.argv[2], "hex")));
const remoteBridge = Array.from(Uint8Array.from(Buffer.from(process.argv[3], "hex")));

(async () => {
  try {
    const deployer = provider.wallet.publicKey; // Get wallet address

    const tx = await program.methods
			.setRemoteBridgeConfig(remoteChainId, remoteBridge)
			.accounts({
        admin: deployer,
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
