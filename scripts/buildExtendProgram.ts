import * as anchor from "@coral-xyz/anchor";
import {
  PublicKey,
  TransactionInstruction,
  SystemProgram,
  SYSVAR_RENT_PUBKEY, 
} from "@solana/web3.js";
import { getBase58EncodedTxBytes } from "./utils";

// Provide instructions.
if (process.argv.indexOf("--help") > -1) {
  console.log(`Usage: ANCHOR_PROVIDER_URL=<rpc_url> ANCHOR_WALLET=<wallet_path> yarn buildExtendProgram <programId> <upgrade authority> <additional bytes> [--populate]

    Build extend program size transaction.`);
  process.exit(0);
}

const BPF_LOADER_UPGRADEABLE = new PublicKey(
  "BPFLoaderUpgradeab1e11111111111111111111111"
);
// Instruction discriminator for ExtendProgram is [6] (index 6)
const EXTEND_PROGRAM_DISCRIMINATOR = Buffer.from([6, 0, 0, 0]);

const provider = anchor.AnchorProvider.env();
anchor.setProvider(provider);

// If we have a populate flag at the end of the call, we return the bytes.
let populate = process.argv.at(-1) === "--populate";

const programId = new PublicKey(process.argv[2]);
const upgradeAuthority = new PublicKey(process.argv[3]);
const additionalBytes = Number(process.argv[4])

const additionalBytesBuffer = Buffer.alloc(4);
additionalBytesBuffer.writeUInt32LE(additionalBytes, 0);

const data = Buffer.concat([EXTEND_PROGRAM_DISCRIMINATOR, additionalBytesBuffer]);

const programData = PublicKey.findProgramAddressSync(
        [programId.toBuffer()],
        new PublicKey("BPFLoaderUpgradeab1e11111111111111111111111")
      )[0];

const extendProgramIx = new TransactionInstruction({
  programId: BPF_LOADER_UPGRADEABLE,
  keys: [
    { pubkey: programData, isSigner: false, isWritable: true },  // program data account
    { pubkey: programId,          isSigner: false, isWritable: true },  // program account
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    { pubkey: upgradeAuthority,           isSigner: false, isWritable: true }, // upgrade authority (Squads vault)
    // Optional: payer if different from authority
    // { pubkey: upgradeAuthority, isSigner: true, isWritable: true },
  ],
  data,
});


(async () => {
  try {

    if (populate) {
      console.log(`Transaction bytes: ${await getBase58EncodedTxBytes(extendProgramIx, provider.connection)}`);
    } else {
      const tx = new anchor.web3.Transaction().add(extendProgramIx);
      const txSig = await provider.sendAndConfirm(tx);
      console.log("Transaction Signature:", txSig);
    }
  } catch (err) {
    console.error("Error enabling bascule:", err);
  }
})();
