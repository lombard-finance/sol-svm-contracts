import * as anchor from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { getBase58EncodedTxBytes } from "../utils";
import { AssetRouter } from "../../target/types/asset_router";

// Provide instructions.
if (process.argv.indexOf("--help") > -1) {
  console.log(`Usage: PROGRAM_ID=<program_id> ANCHOR_PROVIDER_URL=<rpc_url> ANCHOR_WALLET=<wallet_path> yarn gmp_assetRouterSetTokenConfig <mint> <redeem fee> <redeem for BTC min amount> <max mint commission> <to native commission> <ledger handler>

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

const mint = new PublicKey(process.argv[2]);
const redeemFee = new anchor.BN(process.argv[3]);
const redeemForBtcMinAmount = new anchor.BN(process.argv[4]);
const maxMinCommission = new anchor.BN(process.argv[5]);
const toNativeCommission = new anchor.BN(process.argv[6]);
const ledgerRedeemHandler = Array.from(Uint8Array.from(Buffer.from(process.argv[7], "hex")));

(async () => {
  try {
    const admin = provider.wallet.publicKey; // Get wallet address
    const config = {
      redeemFee: redeemFee,
      redeemForBtcMinAmount: redeemForBtcMinAmount,
      maxMintCommission: maxMinCommission,
      toNativeCommission: toNativeCommission,
      ledgerRedeemHandler: ledgerRedeemHandler,
    };
    console.log(`Token config: ${JSON.stringify(config)}`);

    const tx = await program.methods.setTokenConfig(mint, config).accounts({
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
