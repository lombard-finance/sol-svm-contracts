import * as anchor from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { getBase58EncodedTxBytes } from "../utils";
import { Bridge } from "../../target/types/bridge";

// Provide instructions.
if (process.argv.indexOf("--help") > -1) {
  console.log(`Usage: PROGRAM_ID=<program_id> ANCHOR_PROVIDER_URL=<rpc_url> ANCHOR_WALLET=<wallet_path> yarn crosschain_bridgeSetRemoteTokenConfig <mint address> <remote chain id> <remote token address> <direction bitmask: 1|2|3> [--populate]

    Sets remote token config on the bridge. `);
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

const mint = new PublicKey(process.argv[2]);
const remoteChainId = Array.from(Uint8Array.from(Buffer.from(process.argv[3], "hex")));
const remoteBridge = Array.from(Uint8Array.from(Buffer.from(process.argv[4], "hex")));
const direction = Number(process.argv[5]);

(async () => {
  try {
    const deployer = provider.wallet.publicKey; // Get wallet address

    const tx = await program.methods
			.setRemoteTokenConfig(mint, remoteChainId, remoteBridge, direction)
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
