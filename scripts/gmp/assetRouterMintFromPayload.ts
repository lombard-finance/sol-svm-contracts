import * as anchor from "@coral-xyz/anchor";
import * as spl from "@solana/spl-token";
import { PublicKey } from "@solana/web3.js";
import { sha256 } from "js-sha256";
import { getBase58EncodedTxBytes } from "../utils";
import { AssetRouter } from "../../target/types/asset_router";

const VALIDATED_PAYLOAD_SEED = Buffer.from("validated_payload");
const DEPOSIT_PAYLOAD_SPENT_SEED = Buffer.from("deposit_payload_spent");
const ASSET_ROUTER_CONFIG_SEED = Buffer.from("asset_router_config");
const DEPOSIT_V1_PAYLOAD_LEN = 196;

// Provide instructions.
if (process.argv.indexOf("--help") > -1) {
  console.log(`Usage: PROGRAM_ID=<asset_router_program_id> [CONSORTIUM_PROGRAM_ID=<consortium_program_id>] ANCHOR_PROVIDER_URL=<rpc_url> ANCHOR_WALLET=<wallet_path> yarn gmp_assetRouterMintFromPayload <mint_payload_hex>

    Calls asset_router::mint_from_payload using an already-validated consortium payload.`);
  process.exit(0);
}

const provider = anchor.AnchorProvider.env();
anchor.setProvider(provider);

if (!process.env.PROGRAM_ID) {
  console.error("no asset router program id set");
  process.exit(1);
}
const assetRouterProgramId = new PublicKey(process.env.PROGRAM_ID);
const assetRouterProgram = new anchor.Program(
  require("../../target/idl/asset_router.json"),
  provider,
) as anchor.Program<AssetRouter>;

if (!assetRouterProgram.programId.equals(assetRouterProgramId)) {
  console.error("the asset router program id in the idl does not match PROGRAM_ID");
  process.exit(1);
}

const consortiumIdl = require("../../target/idl/consortium.json");
const consortiumProgramId = process.env.CONSORTIUM_PROGRAM_ID
  ? new PublicKey(process.env.CONSORTIUM_PROGRAM_ID)
  : new PublicKey(consortiumIdl.address);

// If we have a populate flag at the end of the call, we return the bytes.
let populate = process.argv.at(-1) === "--populate";

const payloadHex = process.argv[2]?.replace(/^0x/, "");
if (!payloadHex) {
  console.error("missing mint payload hex");
  process.exit(1);
}
const mintPayload = Buffer.from(payloadHex, "hex");
if (mintPayload.length !== DEPOSIT_V1_PAYLOAD_LEN) {
  console.error(`mint payload must be exactly ${DEPOSIT_V1_PAYLOAD_LEN} bytes, got ${mintPayload.length}`);
  process.exit(1);
}

function getValidatedPayloadPDA(payloadHash: Buffer, program: PublicKey) {
  return PublicKey.findProgramAddressSync([VALIDATED_PAYLOAD_SEED, payloadHash], program)[0];
}

function getDepositPayloadSpentPDA(payloadHash: Buffer, program: PublicKey) {
  return PublicKey.findProgramAddressSync([DEPOSIT_PAYLOAD_SPENT_SEED, payloadHash], program)[0];
}

(async () => {
  try {
    const payer = provider.wallet.publicKey;
    const mintPayloadHash = Buffer.from(sha256(mintPayload), "hex");
    const recipient = new PublicKey(mintPayload.subarray(36, 68));

    const consortiumValidatedPayloadPDA = getValidatedPayloadPDA(mintPayloadHash, consortiumProgramId);
    const depositPayloadSpentPDA = getDepositPayloadSpentPDA(mintPayloadHash, assetRouterProgramId);

    const assetRouterConfig = await assetRouterProgram.account.config.fetch(
      PublicKey.findProgramAddressSync([ASSET_ROUTER_CONFIG_SEED], assetRouterProgramId)[0],
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

    console.log("Consortium validated payload PDA:", consortiumValidatedPayloadPDA.toBase58());
    console.log("AssetRouter deposit payload spent PDA:", depositPayloadSpentPDA.toBase58());
    console.log("Mint payload hash:", mintPayloadHash.toString("hex"));
    console.log("Recipient token account:", recipient.toBase58());
    console.log("Token program:", tokenProgram.toBase58());
    console.log("Mint:", mint.toBase58());

    const mintFromPayloadTx = await assetRouterProgram.methods
      .mintFromPayload([...mintPayload], [...mintPayloadHash])
      .accounts({
        payer,
        tokenProgram,
        recipient,
        mint,
        mintAuthority,
        consortiumValidatedPayload: consortiumValidatedPayloadPDA,
        depositPayloadSpent: depositPayloadSpentPDA,
        basculeProgram: null,
        basculeData: null,
        basculeDeposit: null,
      });

    if (populate) {
      console.log(
        "MintFromPayload transaction bytes:",
        await getBase58EncodedTxBytes(await mintFromPayloadTx.instruction(), provider.connection),
      );
      process.exit(0);
    }

    console.log("MintFromPayload signature:", await mintFromPayloadTx.rpc());
  } catch (err) {
    console.error("Error minting from payload through asset router:", err);
    process.exit(1);
  }
})();
