import * as anchor from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { getBase58EncodedTxBytes } from "../utils";
import { AssetRouter } from "../../target/types/asset_router";

// Provide instructions.
if (process.argv.indexOf("--help") > -1) {
  console.log(`Usage: PROGRAM_ID=<program_id> ANCHOR_PROVIDER_URL=<rpc_url> ANCHOR_WALLET=<wallet_path> yarn gmp_assetRouterUnsetTokenRoute <from chain> <from token> <to chain> <to token> <route type>

    Initializes the Mailbox contract. `);
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

const fromChainId = Array.from(Uint8Array.from(Buffer.from(process.argv[2], "hex")));
const toChainId = Array.from(Uint8Array.from(Buffer.from(process.argv[4], "hex")));
const depositPathType = { deposit: {} };
const redeemPathType = { redeem: {} };
if (process.argv[6] != "deposit" && process.argv[6] != "deposit-local" && process.argv[6] != "redeem" && process.argv[6] != "redeem-local") {
  throw Error("unexpected path type")
}
let pathType: any;
let fromToken;
let toToken;
if (process.argv[6] == "deposit") {
  pathType = depositPathType;
  fromToken = Array.from(Uint8Array.from(Buffer.from(process.argv[3], "hex")));
  toToken = (new PublicKey(process.argv[5])).toBytes();
} else if (process.argv[6] == "deposit-local")  {
  pathType = depositPathType;
  fromToken = (new PublicKey(process.argv[3])).toBytes();
  toToken = (new PublicKey(process.argv[5])).toBytes();
} else if (process.argv[6] == "redeem")  {
  pathType = depositPathType;
  fromToken = (new PublicKey(process.argv[3])).toBytes();
  toToken = Array.from(Uint8Array.from(Buffer.from(process.argv[5], "hex")));
} else if (process.argv[6] == "redeem-local")  {
  pathType = redeemPathType;
  fromToken = (new PublicKey(process.argv[3])).toBytes();
  toToken = (new PublicKey(process.argv[5])).toBytes();;
}

// const pathType = process.argv[5] == "deposit" ? depositPathType : redeemPathType;

(async () => {
  try {
    const admin = provider.wallet.publicKey; // Get wallet address

    const tx = await program.methods.unsetTokenRoute(fromChainId, fromToken, toChainId, toToken).accounts({
      payer: admin,
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
