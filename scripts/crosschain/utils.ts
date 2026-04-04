import { PublicKey } from "@solana/web3.js";
import { TOKEN_POOL_SIGNER_SEED, TOKEN_POOL_STATE_SEED } from "./constants";

export function getTokenPoolSigner(mint: PublicKey, program: PublicKey) {
  return PublicKey.findProgramAddressSync([TOKEN_POOL_SIGNER_SEED, mint.toBytes()], program)[0];
}

export function getTokenPoolState(mint: PublicKey, program: PublicKey) {
  return PublicKey.findProgramAddressSync([TOKEN_POOL_STATE_SEED, mint.toBytes()], program)[0];
}
