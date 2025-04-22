import * as anchor from "@coral-xyz/anchor";
import * as spl from "@solana/spl-token";
import { PublicKey } from "@solana/web3.js";
import { Lbtc } from "../target/types/lbtc";
import { getBase58EncodedTxBytes, getConfigPDA } from "./utils";

// Provide instructions.
if (process.argv.indexOf("--help") > -1) {
  console.log(`Usage: PROGRAM_ID=<program_id> ANCHOR_PROVIDER_URL=<rpc_url> ANCHOR_WALLET=<wallet_path> yarn redeem <script_pubkey> <amount>

    Redeems LBTC.`);
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
const program = new anchor.Program(require("../target/idl/lbtc.json"), provider) as anchor.Program<Lbtc>;

if (!program.programId.equals(programId)) {
  console.error("the program id in the idl does not match the program id passed as env variable");
  process.exit(1);
}

// If we have a populate flag at the end of the call, we return the bytes.
let populate = process.argv.at(-1) === "--populate";

const scriptPubkey = Buffer.from(process.argv[2], "hex");
const amount = new anchor.BN(process.argv[3]);

(async () => {
  try {
    const payer = provider.wallet.publicKey; // Get wallet address

    const unstakerTA = await spl.getAssociatedTokenAddress(mint, payer, false, spl.TOKEN_PROGRAM_ID);

    console.log(`Unstaker Token Account: ${unstakerTA.toBase58()}`);

    // Derive PDA for config
    const configPDA = getConfigPDA(programId);
    console.log("Using config PDA:", configPDA.toBase58());

    // Retrieve LBTC mint
    const cfg = await program.account.config.fetch(configPDA);
    const mint = cfg.mint;

    const tx = await program.methods.redeem(scriptPubkey, amount).accounts({
      payer: payer,
      holder: unstakerTA,
      config: configPDA,
      tokenProgram: spl.TOKEN_PROGRAM_ID,
      mint,
      treasury: cfg.treasury
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
