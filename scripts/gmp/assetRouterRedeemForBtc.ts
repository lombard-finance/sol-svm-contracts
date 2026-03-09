import * as anchor from "@coral-xyz/anchor";
import * as spl from "@solana/spl-token";
import { PublicKey } from "@solana/web3.js";
import { AssetRouter } from "../../target/types/asset_router";
import { getBase58EncodedTxBytes, getConfigPDA } from "../utils";
import { getAssetRouterConfigPDA, getAssetRouterTokenBtcRoutePDA, getMailboxConfigPDA, getMailboxOutboundMessagePDA, getMailboxSenderConfigPDA, getOutboundMessagePathPDA } from "./utils";
import { Mailbox } from "../../target/types/mailbox";

// Provide instructions.
if (process.argv.indexOf("--help") > -1) {
  console.log(`Usage: PROGRAM_ID=<program_id> [MAILBOX_PROGRAM_ID=<mailbox_program_id>] ANCHOR_PROVIDER_URL=<rpc_url> ANCHOR_WALLET=<wallet_path> yarn gmp_assetRouterRedeemForBtc <mint> <script_pubkey> <amount> <solana chain ID> <bitcoin chainId> <ledger chainId>

    Redeems one of tokens for BTC.`);
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

const mailboxIdl = require("../../target/idl/mailbox.json");
const mailboxProgramId = process.env.CONSORTIUM_PROGRAM_ID
  ? new PublicKey(process.env.MAILBOX_PROGRAM_ID)
  : new PublicKey(mailboxIdl.address);
const mailboxProgram = new anchor.Program(
  require("../../target/idl/mailbox.json"),
  provider,
) as anchor.Program<Mailbox>;
if (!mailboxProgram.programId.equals(mailboxProgramId)) {
  console.error("the mailbox program id in the idl does not match the program id passed as env variable");
  process.exit(1);
}

// If we have a populate flag at the end of the call, we return the bytes.
let populate = process.argv.at(-1) === "--populate";

const mint = new PublicKey(process.argv[2]);
const scriptPubkey = Buffer.from(process.argv[3], "hex");
const amount = new anchor.BN(process.argv[4]);
const solanaChainID = Buffer.from(process.argv[5], "hex");
const bitcoinChainID = Buffer.from(process.argv[6], "hex");
const ledgerChainID = Buffer.from(process.argv[7], "hex");

(async () => {
  try {
    const payer = provider.wallet.publicKey; // Get wallet address

    // Derive PDA for AssetRouter config
    const assetRouterConfigPDA = getAssetRouterConfigPDA(programId);
    console.log("Using AssetRouter config PDA:", assetRouterConfigPDA.toBase58());
    const assetRouterConfig = await program.account.config.fetch(assetRouterConfigPDA);

    // Derive PDA for Mailbox config
    const mailboxConfigPDA = getMailboxConfigPDA(mailboxProgramId);
    console.log("Using Mailbox config PDA:", mailboxConfigPDA.toBase58());
    const mailboxConfig = await mailboxProgram.account.config.fetch(mailboxConfigPDA);

    const tokenRoutePDA = getAssetRouterTokenBtcRoutePDA(programId, solanaChainID, bitcoinChainID, mint);
    const outboundMessagePathPDA = getOutboundMessagePathPDA(mailboxProgramId, ledgerChainID);
    const senderConfigPDA = getMailboxSenderConfigPDA(mailboxProgramId, programId);
    const outboundMessagePDA = getMailboxOutboundMessagePDA(mailboxProgramId, mailboxConfig.globalNonce);
    console.log("Outbound message PDA:", outboundMessagePDA.toBase58());

    const mintAccountInfo = await provider.connection.getAccountInfo(mint);
    if (!mintAccountInfo) {
      throw new Error(`mint account not found: ${mint.toBase58()}`);
    }
    const tokenProgram = mintAccountInfo.owner;

    const unstakerTA = await spl.getAssociatedTokenAddress(mint, payer, false, tokenProgram);
    const treasuryTA = await spl.getAssociatedTokenAddress(mint, assetRouterConfig.treasury, false, tokenProgram);

    console.log(`Unstaker Token Account: ${unstakerTA.toBase58()}`);

    const tx = await program.methods.redeemForBtc(scriptPubkey, amount).accounts({
      payer: payer,
      tokenRoute: tokenRoutePDA,
      payerTokenAccount: unstakerTA,
      tokenProgram: tokenProgram,
      treasuryTokenAccount: treasuryTA,
      mint: mint,
      mailboxConfig: mailboxConfigPDA,
      outboundMessagePath: outboundMessagePathPDA,
      outboundMessage: outboundMessagePDA,
      senderConfig: senderConfigPDA,
      treasury: assetRouterConfig.treasury
    });

    if (populate) {
      console.log("Transaction bytes:", await getBase58EncodedTxBytes(await tx.instruction(), provider.connection));
    } else {
      console.log("Transaction Signature:", await tx.rpc());
    }
  } catch (err) {
    console.error("Error redeeming:", err);
  }
})();
