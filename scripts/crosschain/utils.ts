import { PublicKey } from "@solana/web3.js";
import * as anchor from "@coral-xyz/anchor";
import { BRIDGE_CONFIG_SEED, BRIDGE_LOCAL_TOKEN_CONFIG_SEED, BRIDGE_SENDER_CONFIG_SEED, TOKEN_POOL_CHAIN_CONFIG_SEED, TOKEN_POOL_SIGNER_SEED, TOKEN_POOL_STATE_SEED } from "./constants";

export function getTokenPoolSigner(mint: PublicKey, program: PublicKey) {
  return PublicKey.findProgramAddressSync([TOKEN_POOL_SIGNER_SEED, mint.toBytes()], program)[0];
}

export function getTokenPoolState(mint: PublicKey, program: PublicKey) {
  return PublicKey.findProgramAddressSync([TOKEN_POOL_STATE_SEED, mint.toBytes()], program)[0];
}

export function getTokenPoolChainConfig(mint: PublicKey, foreignChainSelector: anchor.BN, program: PublicKey) {
  return PublicKey.findProgramAddressSync([TOKEN_POOL_CHAIN_CONFIG_SEED, foreignChainSelector.toBuffer("le", 8), mint.toBytes()], program)[0];
}

export function getBridgeConfigPDA(program: PublicKey) {
  return PublicKey.findProgramAddressSync([BRIDGE_CONFIG_SEED], program)[0];
}

export function getBridgeLocalTokenConfigPDA(mint: PublicKey, program: PublicKey) {
  return PublicKey.findProgramAddressSync([BRIDGE_LOCAL_TOKEN_CONFIG_SEED, mint.toBytes()], program)[0];
}

export function getBridgeSenderConfigPDA(sender: PublicKey, program: PublicKey) {
  return PublicKey.findProgramAddressSync([BRIDGE_SENDER_CONFIG_SEED, sender.toBytes()], program)[0];
}
