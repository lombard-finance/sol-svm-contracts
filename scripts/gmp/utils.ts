import { Connection, Transaction, PublicKey, TransactionInstruction } from "@solana/web3.js";
import * as anchor from "@coral-xyz/anchor";
import { AnchorProvider, Program } from "@coral-xyz/anchor";
import bs58 from "bs58";
import { ASSET_ROUTER_CONFIG_SEED, ASSET_ROUTER_TOKEN_ROUTE_SEED, CONSORTIUM_CONFIG_SEED, CONSORTIUM_SESSION_PAYLOAD_SEED, CONSORTIUM_SESSION_SEED, CONSORTIUM_VALIDATED_PAYLOAD_SEED, MAILBOX_CONFIG_SEED, MAILBOX_INBOUND_MESSGE_PATH_SEED, MAILBOX_MESSAGE_HANDLED_SEED, MAILBOX_OUTBOUND_MESSAGE_SEED, MAILBOX_OUTBOUND_MESSGE_PATH_SEED, MAILBOX_SENDER_CONFIG_SEED, ORACLE_SEED } from "./constants";
import { sha256 } from "js-sha256";

const BITCOIN_ADDRESS = Buffer.from("0000000000000000000000000000000000000000000000000000000000000001", "hex"); 

export function getConsortiumConfigPDA(program: PublicKey) {
  return PublicKey.findProgramAddressSync([CONSORTIUM_CONFIG_SEED], program)[0];
}

export function getConsortiumSessionPDA(program: PublicKey, payer: PublicKey, payloadHash: Buffer<ArrayBuffer>, epoch: anchor.BN) {
  return PublicKey.findProgramAddressSync([CONSORTIUM_SESSION_SEED, epoch.toBuffer("be", 8), payer.toBytes(), payloadHash], program)[0];
}

export function getConsortiumSessionPayloadPDA(program: PublicKey, payer: PublicKey, payloadHash: Buffer<ArrayBuffer>) {
  return PublicKey.findProgramAddressSync([CONSORTIUM_SESSION_PAYLOAD_SEED, payer.toBytes(), payloadHash], program)[0];
}

export function getConsortiumValidatedPayloadPDA(program: PublicKey, payloadHash: Buffer<ArrayBuffer>) {
  return PublicKey.findProgramAddressSync([CONSORTIUM_VALIDATED_PAYLOAD_SEED, payloadHash], program)[0];
}

export function getOraclePDA(program: PublicKey, denom: string) {
  return PublicKey.findProgramAddressSync([ORACLE_SEED, Buffer.from(sha256(denom), "hex")], program)[0];
}

export function getAssetRouterConfigPDA(program: PublicKey) {
  return PublicKey.findProgramAddressSync([ASSET_ROUTER_CONFIG_SEED], program)[0];
}

export function getAssetRouterTokenBtcRoutePDA(program: PublicKey, fromChainId: Buffer<ArrayBuffer>, toChainId: Buffer<ArrayBuffer>, mint: PublicKey) {
  return PublicKey.findProgramAddressSync([ASSET_ROUTER_TOKEN_ROUTE_SEED, fromChainId, mint.toBytes(), toChainId, BITCOIN_ADDRESS], program)[0];
}

export function getAssetRouterTokenLocalRoutePDA(program: PublicKey, chainId: Buffer<ArrayBuffer>, fromMint: PublicKey, toMint: PublicKey) {
  return PublicKey.findProgramAddressSync([ASSET_ROUTER_TOKEN_ROUTE_SEED, chainId, fromMint.toBytes(), chainId, toMint.toBytes()], program)[0];
}

export function getMailboxConfigPDA(program: PublicKey) {
  return PublicKey.findProgramAddressSync([MAILBOX_CONFIG_SEED], program)[0];
}

export function getMailboxSenderConfigPDA(program: PublicKey, sender: PublicKey) {
  return PublicKey.findProgramAddressSync([MAILBOX_SENDER_CONFIG_SEED, sender.toBytes()], program)[0];
}

export function getMailboxOutboundMessagePDA(program: PublicKey, nonce: anchor.BN) {
  return PublicKey.findProgramAddressSync([MAILBOX_OUTBOUND_MESSAGE_SEED, nonce.toArrayLike(Buffer, "be", 8)], program)[0];
}

export function getInboundMessagePathPDA(program: PublicKey, fromChainId: Buffer<ArrayBuffer>) {
  return PublicKey.findProgramAddressSync([MAILBOX_INBOUND_MESSGE_PATH_SEED, fromChainId], program)[0];
}

export function getOutboundMessagePathPDA(program: PublicKey, toChainId: Buffer<ArrayBuffer>) {
  return PublicKey.findProgramAddressSync([MAILBOX_OUTBOUND_MESSGE_PATH_SEED, toChainId], program)[0];
}

export function getMesageHandledPDA(program: PublicKey, messageHash: Buffer<ArrayBuffer>) {
  return PublicKey.findProgramAddressSync([MAILBOX_MESSAGE_HANDLED_SEED, messageHash], program)[0];
}

export function extractR(sigBytes: Buffer<ArrayBuffer>): Buffer<ArrayBuffer> {
  const startR = (sigBytes[1] & 0x80) == 0 ? 2 : 3;
  const lengthR = sigBytes[startR+1];
  return sigBytes.subarray(startR+2, startR+2+lengthR);
}

export function extractS(sigBytes: Buffer<ArrayBuffer>): Buffer<ArrayBuffer> {
  const startR = (sigBytes[1] & 0x80) == 0 ? 2 : 3;
  const lengthR = sigBytes[startR+1];
  const startS = startR + 2 + lengthR;
  const lengthS = sigBytes[startS + 1];
  return sigBytes.subarray(startS+2, startS+2+lengthS);
}

export function convertToRS(sigBytes: Buffer<ArrayBuffer>): Buffer<ArrayBuffer> {
  return Buffer.concat([extractR(sigBytes), extractS(sigBytes)]);
}

export function convertToBuf(data: string): Buffer<ArrayBuffer> {
  //Try 1hex` encoding first
  let result = Buffer.from(data, "hex");
  if (result.length == 0 ) {
    // Try `base64` encoding
    result = Buffer.from(data, "base64");
  }
  return result;
}

// export function getTokenAuthority(program: PublicKey) {
//   return PublicKey.findProgramAddressSync([TOKEN_AUTHORITY_SEED], program)[0];
// }

// export function getMetadataPDA(payloadHash: Buffer, payer: PublicKey, program: PublicKey) {
//   return PublicKey.findProgramAddressSync([payloadHash, METADATA_SEED, payer.toBuffer()], program)[0];
// }

// export function getMintPayloadPDA(payloadHash: Buffer, program: PublicKey) {
//   return PublicKey.findProgramAddressSync([payloadHash], program)[0];
// }

// export function getValsetPayloadPDA(payloadHash: Buffer, payer: PublicKey, program: PublicKey) {
//   return PublicKey.findProgramAddressSync([payloadHash, payer.toBuffer()], program)[0];
// }

// export function getPeerConfigPDA() {
//   const oftStore = new PublicKey("CQeKmXxoGog57U5jPyYz7YAo8AuLUdoDqxGTXtMPkMuc");
//   const dstEidBuffer = Buffer.alloc(4);
//   dstEidBuffer.writeUInt32BE(30101);
//   const oft = new PublicKey("7QkBVz37mjevzKYJDcVy6xKDG1hUewWgj51Dehgcu5sM");
//   const [peerConfigPDA] = PublicKey.findProgramAddressSync(
//     [Buffer.from("Peer"), oftStore.toBuffer(), dstEidBuffer],
//     oft
//   );
//   console.log(peerConfigPDA);
// }
