import * as anchor from "@coral-xyz/anchor";
import * as spl from "@solana/spl-token";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { getBase58EncodedTxBytes, getTokenAuthority } from "../utils";
import { Mailbox } from "../../target/types/mailbox";
import { sha256 } from "js-sha256";
import { getAssetRouterConfigPDA, getConsortiumSessionPayloadPDA, getConsortiumValidatedPayloadPDA, getInboundMessagePathPDA, getMesageHandledPDA } from "./utils";

// Provide instructions.
if (process.argv.indexOf("--help") > -1) {
  console.log(`Usage: PROGRAM_ID=<program_id> ASSET_ROUTER_PROGRAM_ID=<consotrium_program_id> ANCHOR_PROVIDER_URL=<rpc_url> ANCHOR_WALLET=<wallet_path> yarn gmp_mailboxHandleMessage <payload>

    Triggers message handling by the Mailbox contract. `);
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
const program = new anchor.Program(require("../../target/idl/mailbox.json"), provider) as anchor.Program<Mailbox>;

if (!program.programId.equals(programId)) {
  console.error("the program id in the idl does not match the program id passed as env variable");
  process.exit(1);
}

const assetRouterIdl = require("../../target/idl/asset_router.json");
const assetRouterProgramId = process.env.ASSET_ROUTER_PROGRAM_ID
  ? new PublicKey(process.env.ASSET_ROUTER_PROGRAM_ID)
  : new PublicKey(assetRouterIdl.address);

// If we have a populate flag at the end of the call, we return the bytes.
let populate = process.argv.at(-1) === "--populate";
const payloadBuf = Buffer.from(process.argv[2], "hex");
const payload = Array.from(Uint8Array.from(payloadBuf));
const payloadHashBuf = Buffer.from(sha256(payload), "hex");
const payloadHash = Array.from(Uint8Array.from(payloadHashBuf));

(async () => {
  try {
    const payer = provider.wallet.publicKey; // Get wallet address

    const assetRouterConfigPDA = getAssetRouterConfigPDA(assetRouterProgramId);
    const messageHandledPDA = getMesageHandledPDA(assetRouterProgramId, payloadHashBuf);
    const mint = new PublicKey(payloadBuf.subarray(232, 264));

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
    const tokenAuthority = getTokenAuthority(assetRouterProgramId);

    const msgRecipient = new PublicKey(payloadBuf.subarray(100, 132));
    const tokenRecipient = new PublicKey(payloadBuf.subarray(264, 296));

    console.log("asset router config PDA:", assetRouterConfigPDA.toBase58());
    console.log("message handled PDA:", messageHandledPDA.toBase58());
    console.log("Token program:", tokenProgram.toBase58());
    console.log("Recipient token account:", tokenRecipient.toBase58());
    console.log("mint authority:", mintAuthority.toBase58());
    console.log("token authority:", tokenAuthority.toBase58());
    console.log("Mint:", mint.toBase58());

    const tx = await program.methods.handleMessage(payloadHash).accounts({
      handler: payer,
      recipientProgram: msgRecipient,
    })
    .remainingAccounts([
      {
        pubkey: payer,
        isWritable: true,
        isSigner: true
      },
      {
        pubkey: assetRouterConfigPDA,
        isWritable: false,
        isSigner: false
      },
      {
        pubkey: messageHandledPDA,
        isWritable: true,
        isSigner: false
      },
      {
        pubkey: tokenProgram,
        isWritable: false,
        isSigner: false
      },
      {
        pubkey: tokenRecipient,
        isWritable: true,
        isSigner: false
      },
      {
        pubkey: mint,
        isWritable: true,
        isSigner: false
      },
      {
        pubkey: mintAuthority,
        isWritable: false,
        isSigner: false
      },
      {
        pubkey: tokenAuthority,
        isWritable: false,
        isSigner: false
      },
      {
        pubkey: SystemProgram.programId,
        isWritable: false,
        isSigner: false
      },
      {
        pubkey: assetRouterProgramId,
        isWritable: false,
        isSigner: false
      },
      {
        pubkey: assetRouterProgramId,
        isWritable: false,
        isSigner: false
      },
      {
        pubkey: assetRouterProgramId,
        isWritable: false,
        isSigner: false
      },
      {
        pubkey: assetRouterProgramId,
        isWritable: false,
        isSigner: false
      },
      {
        pubkey: assetRouterProgramId,
        isWritable: false,
        isSigner: false
      }
    ]);

    if (populate) {
      console.log("Transaction bytes:", await getBase58EncodedTxBytes(await tx.instruction(), provider.connection));
    } else {
      console.log("Transaction Signature:", await tx.rpc());
    }
  } catch (err) {
    console.error("Error handling GMP message:", err);
  }
})();
