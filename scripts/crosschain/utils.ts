import { PublicKey } from "@solana/web3.js";
import { TOKEN_POOL_SIGNER_SEED } from "./constants";

export function getTokenPoolSigner(mint: PublicKey, program: PublicKey) {
  return PublicKey.findProgramAddressSync([TOKEN_POOL_SIGNER_SEED, mint.toBytes()], program)[0];
}