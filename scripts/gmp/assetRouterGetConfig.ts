import * as anchor from "@coral-xyz/anchor";
import * as spl from "@solana/spl-token";
import { PublicKey } from "@solana/web3.js";
import { getBase58EncodedTxBytes, getTokenAuthority } from "../utils";
import { AssetRouter } from "../../target/types/asset_router";
import { getAssetRouterConfigPDA } from "./utils";
import { Bridge } from "../../target/types/bridge";

// Provide instructions.
if (process.argv.indexOf("--help") > -1) {
  console.log(`Usage: PROGRAM_ID=<program_id> BRIDGE_PROGRAM_ID=<program_id> ANCHOR_PROVIDER_URL=<rpc_url> ANCHOR_WALLET=<wallet_path> yarn gmp_assetRouterGetConfig

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
const bridgeIdl = require("../../target/idl/bridge.json");
const bridgeProgramId = process.env.BRIDGE_PROGRAM_ID
  ? new PublicKey(process.env.MAILBOX_PROGRAM_ID)
  : new PublicKey(bridgeIdl.address);
const mailboxProgram = new anchor.Program(
  require("../../target/idl/bridge.json"),
  provider,
) as anchor.Program<Bridge>;
if (!mailboxProgram.programId.equals(bridgeProgramId)) {
  console.error("the bridge program id in the idl does not match the program id passed as env variable");
  process.exit(1);
}

(async () => {
  try {
    const admin = provider.wallet.publicKey; // Get wallet address
    const configPDA = getAssetRouterConfigPDA(programId);

    console.log(`Asset Router config PDA: ${configPDA.toBase58()}`);

    const config = await program.account.config.fetch(configPDA);
    console.log(`config contents: ${JSON.stringify(config)}`)

  } catch (err) {
    console.error("Error setting initial validator set:", err);
  }
  const assetRouterConfig = await program.account.config.fetch(
      getAssetRouterConfigPDA(programId),
    );
  const mint = assetRouterConfig.nativeMint as PublicKey;

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
  const arTokenAuthority = getTokenAuthority(programId)
  const bTokenAuthority = getTokenAuthority(bridgeProgramId)
  console.log("Token program:", tokenProgram.toBase58());
  console.log("Mint:", mint.toBase58());
  console.log("Mint authority:", mintAuthority.toBase58());
  console.log("Asset Router token authority:", arTokenAuthority.toBase58());
  console.log("Bridge token authority:", bTokenAuthority.toBase58());

})();
