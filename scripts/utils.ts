import { Connection, Transaction, PublicKey, TransactionInstruction } from "@solana/web3.js";
import { AnchorProvider, Program } from "@coral-xyz/anchor";
import bs58 from "bs58";
import { CONFIG_SEED, TOKEN_AUTHORITY_SEED, METADATA_SEED } from "./constants";

export async function getBase58EncodedTxBytes(instruction: TransactionInstruction, connection: Connection) {
  const transaction = new Transaction().add(instruction);

  const { blockhash } = await connection.getLatestBlockhash();
  transaction.recentBlockhash = blockhash;

  const provider = AnchorProvider.env();
  transaction.feePayer = provider.wallet.publicKey;

  const serializedTransaction = transaction.serializeMessage();
  const base58EncodedTx = bs58.encode(serializedTransaction);
  return base58EncodedTx;
}

export function getConfigPDA(program: PublicKey) {
  return PublicKey.findProgramAddressSync([CONFIG_SEED], program)[0];
}

export function getTokenAuthority(program: PublicKey) {
  return PublicKey.findProgramAddressSync([TOKEN_AUTHORITY_SEED], program)[0];
}

export function getMetadataPDA(payloadHash: Buffer, payer: PublicKey, program: PublicKey) {
  return PublicKey.findProgramAddressSync([payloadHash, METADATA_SEED, payer.toBuffer()], program)[0];
}

export function getMintPayloadPDA(payloadHash: Buffer, program: PublicKey) {
  return PublicKey.findProgramAddressSync([payloadHash], program)[0];
}

export function getValsetPayloadPDA(payloadHash: Buffer, payer: PublicKey, program: PublicKey) {
  return PublicKey.findProgramAddressSync([payloadHash, payer.toBuffer()], program)[0];
}

export function getPeerConfigPDA() {
  const oftStore = new PublicKey("CQeKmXxoGog57U5jPyYz7YAo8AuLUdoDqxGTXtMPkMuc");
  const dstEidBuffer = Buffer.alloc(4);
  dstEidBuffer.writeUInt32BE(30101);
  const oft = new PublicKey("7QkBVz37mjevzKYJDcVy6xKDG1hUewWgj51Dehgcu5sM");
  const [peerConfigPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("Peer"), oftStore.toBuffer(), dstEidBuffer],
    oft
  );
  console.log(peerConfigPDA);
}
