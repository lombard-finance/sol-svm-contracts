import * as anchor from "@coral-xyz/anchor";
import * as spl from "@solana/spl-token";
import { PublicKey } from "@solana/web3.js";
import { Lbtc } from "../target/types/lbtc";
import { getBase58EncodedTxBytes, getConfigPDA, getTokenAuthority } from "./utils";

// Provide instructions.
if (process.argv.indexOf("--help") > -1) {
  console.log(`Usage: PROGRAM_ID=<program_id> ANCHOR_PROVIDER_URL=<rpc_url> ANCHOR_WALLET=<wallet_path> yarn changeMintAuth <authority>

    Updates the mint authority of the LBTC token to be <authority>.
    WARNING: This can brick the LBTC minting functionality. Use with extreme caution.`);
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

const authority = new PublicKey(process.argv[2]);

(async () => {
  try {
    const payer = provider.wallet.publicKey; // Get wallet address

    // Derive PDA for token authority
    const tokenAuthority = getTokenAuthority(programId);
    console.log("Using token authority PDA:", tokenAuthority.toBase58());

    // Derive PDA for config
    const configPDA = getConfigPDA(programId);
    console.log("Using config PDA:", configPDA.toBase58());

    // Retrieve LBTC mint
    const cfg = await program.account.config.fetch(configPDA);
    const mint = cfg.mint;

    // Get current authority
    // Hardcoded on base SPL token
    const mintAccount = await spl.getMint(provider.connection, mint, undefined, spl.TOKEN_PROGRAM_ID);
    const currentAuth = mintAccount.mintAuthority;

    const tx = await program.methods.changeMintAuth(authority).accounts({
      payer,
      config: configPDA,
      tokenProgram: spl.TOKEN_PROGRAM_ID,
      mint,
      tokenAuthority,
      currentAuth
    });

    if (populate) {
      console.log("Transaction bytes:", await getBase58EncodedTxBytes(await tx.instruction(), provider.connection));
    } else {
      console.log("Transaction Signature:", await tx.rpc());
    }
  } catch (err) {
    console.error("Error changing mint authority:", err);
  }
})();
