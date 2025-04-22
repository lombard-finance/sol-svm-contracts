import * as sol from "@solana/web3.js";
import { BPF_UPGRADE_LOADER_ID } from "@solana/spl-governance";

export const COMMITMENT = "confirmed";

export function solanaConnection(network: string): sol.Connection {
  const rpcUrl =
    network === "mainnet-beta"
      ? sol.clusterApiUrl("mainnet-beta")
      : network === "testnet"
      ? sol.clusterApiUrl("testnet")
      : network === "devnet"
      ? sol.clusterApiUrl("devnet")
      : network === "localhost"
      ? "http://127.0.0.1:8899"
      : network;
  return new sol.Connection(rpcUrl, COMMITMENT);
}

/** Returns the program data address of the program before it is initialized. */
export function findInitialProgramAddress(programId: sol.PublicKey) {
  return sol.PublicKey.findProgramAddressSync([programId.toBuffer()], BPF_UPGRADE_LOADER_ID)[0];
}
