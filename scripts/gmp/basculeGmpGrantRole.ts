import * as anchor from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { getBase58EncodedTxBytes } from "../utils";
import { BasculeGmp } from "../../target/types/bascule_gmp";
import { BASCULE_GMP_CONFIG_SEED } from "./constants";

// Provide instructions.
if (process.argv.indexOf("--help") > -1) {
  console.log(`Usage: PROGRAM_ID=<asset_router_program_id> ANCHOR_PROVIDER_URL=<rpc_url> ANCHOR_WALLET=<wallet_path> yarn gmp_basculeGmpGrantRole <account> <role>  [--populate]

    Updates the native mint authority through asset_router::change_mint_auth.
    WARNING: This can break minting functionality if misconfigured.`);
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
const program = new anchor.Program(require("../../target/idl/bascule_gmp.json"), provider) as anchor.Program<BasculeGmp>;

if (!program.programId.equals(programId)) {
  console.error("the program id in the idl does not match the program id passed as env variable");
  process.exit(1);
}

// If we have a populate flag at the end of the call, we return the bytes.
let populate = process.argv.at(-1) === "--populate";

const acc = new PublicKey(process.argv[2]);
let role = {}
switch (process.argv[3]) {
  case "mintReporter":
    role = { mintReporter: {} };
    break;
  case "mintValidator":
    role = { mintValidator: {} };
    break;
  case "validationGuardian":
    role = { validationGuardian: {} };
    break;
  case "pauser":
    role = { pauser: {} };
    break;
  default:
    throw new Error("unknown role");
}

(async () => {
  try {
    const admin = provider.wallet.publicKey;
    const configPDA = PublicKey.findProgramAddressSync([BASCULE_GMP_CONFIG_SEED], programId)[0];

    console.log("Using config PDA:", configPDA.toBase58());

    const tx = await program.methods.grantAccountRole(acc, role).accounts({
      admin,
      config: configPDA
    });

    if (populate) {
      console.log("Transaction bytes:", await getBase58EncodedTxBytes(await tx.instruction(), provider.connection));
    } else {
      console.log("Transaction Signature:", await tx.rpc());
    }
  } catch (err) {
    console.error("Error changing asset router mint authority:", err);
    process.exit(1);
  }
})();
