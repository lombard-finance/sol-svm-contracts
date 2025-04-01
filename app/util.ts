import * as sol from "@solana/web3.js";
import { BPF_UPGRADE_LOADER_ID } from "@solana/spl-governance";

export const COMMITMENT = "confirmed";

/** Returns the program data address of the program before it is initialized. */
export function findInitialProgramAddress(programId: sol.PublicKey) {
  return sol.PublicKey.findProgramAddressSync([programId.toBuffer()], BPF_UPGRADE_LOADER_ID)[0];
}
