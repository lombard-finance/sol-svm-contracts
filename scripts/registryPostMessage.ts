import * as anchor from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { Registry } from "../target/types/registry";
import { getBase58EncodedTxBytes } from "./utils";

// Provide instructions.
if (process.argv.indexOf("--help") > -1) {
  console.log(`Usage: PROGRAM_ID=<program_id> ANCHOR_PROVIDER_URL=<rpc_url> ANCHOR_WALLET=<wallet_path> yarn registryPostMessage <message> <nonce>

    Posts payload for the session already created on Consortium contract. `);
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
const program = new anchor.Program(require("../../target/idl/registry.json"), provider) as anchor.Program<Registry>;

if (!program.programId.equals(programId)) {
  console.error("the program id in the idl does not match the program id passed as env variable");
  process.exit(1);
}

// If we have a populate flag at the end of the call, we return the bytes.
let populate = process.argv.at(-1) === "--populate";
let message = Buffer.from(process.argv[2]);
const nonce = Number(process.argv[3]);

(async () => {
  try {
    const payer = provider.wallet.publicKey; // Get wallet address

    // Derive PDA for session
    const mesageDataPDA = getRegistryMessageDataPDA(programId, payer, nonce);
    console.log("message data PDA:", mesageDataPDA.toBase58());

    const tx = await program.methods.postMessage(message, nonce).accounts({
      payer: payer,
      message: mesageDataPDA,
    });

    if (populate) {
      console.log("Transaction bytes:", await getBase58EncodedTxBytes(await tx.instruction(), provider.connection));
    } else {
      console.log("Transaction Signature:", await tx.rpc());
    }
  } catch (err) {
    console.error("Error posting payload:", err);
  }
})();

function getRegistryMessageDataPDA(program: PublicKey, payer: PublicKey, nonce: number) {
  return PublicKey.findProgramAddressSync([Buffer.from("user_message"), payer.toBuffer(), new anchor.BN(nonce).toBuffer("be", 4)], program)[0];
}
