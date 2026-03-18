import * as anchor from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { getBase58EncodedTxBytes } from "../utils";
import { AssetRouter } from "../../target/types/asset_router";

// Provide instructions.
if (process.argv.indexOf("--help") > -1) {
  console.log(`Usage: PROGRAM_ID=<program_id> ANCHOR_PROVIDER_URL=<rpc_url> ANCHOR_WALLET=<wallet_path> yarn gmp_initializeAssetRouter <admin address> <mailbox address> <consortium address> <treasury address> <native mint address> <bitcoin chain id> <ledger chain id> [--bascule-enabled]

    Initializes the AssetRouter contract. `);
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
const program = new anchor.Program(require("../../target/idl/asset_router.json"), provider) as anchor.Program<AssetRouter>;

if (!program.programId.equals(programId)) {
  console.error("the program id in the idl does not match the program id passed as env variable");
  process.exit(1);
}

// If we have a populate flag at the end of the call, we return the bytes.
let populate = process.argv.at(-1) === "--populate";
let basculeEnabled = process.argv.at(-2) === "--bascule_enabled";

const admin = new PublicKey(process.argv[2]);
const mailbox = new PublicKey(process.argv[3]);
const consortium = new PublicKey(process.argv[4]);
const treasury = new PublicKey(process.argv[5]);
const nativeMint = new PublicKey(process.argv[6]);

const bitcoinChainId = Buffer.from(process.argv[7], "hex");
const lendgerChainId = Buffer.from(process.argv[8], "hex");
const programData = PublicKey.findProgramAddressSync(
        [program.programId.toBuffer()],
        new PublicKey("BPFLoaderUpgradeab1e11111111111111111111111")
      )[0];

(async () => {
  try {
    const deployer = provider.wallet.publicKey; // Get wallet address

    const config = {
      admin: admin,
      pendingAdmin: new PublicKey(0), // these are ignored
      treasury: treasury,
      paused: false,
      nativeMint: nativeMint,
      mailbox: mailbox,
      consortium: consortium,
      bascule: null,
      basculeGmp: null,
      ledgerLchainId: Array.from(Uint8Array.from(lendgerChainId)),
      bitcoinLchainId: Array.from(Uint8Array.from(bitcoinChainId))
    };

    console.log(`AssetRouter config: ${JSON.stringify(config)}`);

    const tx = await program.methods.initialize(config).accounts({
      deployer: deployer,
      programData: programData,
    });

    if (populate) {
      console.log("Transaction bytes:", await getBase58EncodedTxBytes(await tx.instruction(), provider.connection));
    } else {
      console.log("Transaction Signature:", await tx.rpc());
    }
  } catch (err) {
    console.error("Error setting initial validator set:", err);
  }
})();
