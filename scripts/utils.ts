import { Connection, Transaction, PublicKey, TransactionInstruction } from '@solana/web3.js';
import { AnchorProvider, Program } from '@coral-xyz/anchor';
import bs58 from 'bs58';

// Create and serialize a transaction with your instruction
export async function getBase58EncodedTxBytes(instruction: TransactionInstruction, connection: Connection) {
  // Create a new transaction
  const transaction = new Transaction().add(instruction);
  
  // Get the current blockhash for the transaction
  const { blockhash } = await connection.getLatestBlockhash();
  transaction.recentBlockhash = blockhash;
  
  // Set the fee payer (usually your wallet)
  const provider = AnchorProvider.env();
  transaction.feePayer = provider.wallet.publicKey;
  
  // Serialize the transaction to buffer
  const serializedTransaction = transaction.serializeMessage();
  
  // Encode the serialized transaction to base58
  const base58EncodedTx = bs58.encode(serializedTransaction);
  
  return base58EncodedTx;
}
