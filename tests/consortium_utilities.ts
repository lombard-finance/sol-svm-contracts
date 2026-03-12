import { secp256k1 } from "@noble/curves/secp256k1";
import { keccak_256 } from "@noble/hashes/sha3";
import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { PublicKey, Keypair } from "@solana/web3.js";
import { Consortium, Consortium as ConsortiumProgram } from "../target/types/consortium";
import { ethers, sha256 } from "ethers";
import chai from "chai";
import chaiAsPromised from "chai-as-promised";

chai.use(chaiAsPromised);
const expect = chai.expect;

const DEPOSIT_V1_SELECTOR = "ce25e7c2";

/**
 * Interface for a secp256k1 keypair
 */
export interface Secp256k1Keypair {
  privateKey: Uint8Array;
  publicKey: Uint8Array;
}

/**
 * Interface for a signature with recovery ID
 */
export interface Signature {
  r: Uint8Array;
  s: Uint8Array;
  recoveryId: number;
}

/**
 * Consortium class for managing keypairs and signing operations
 */
export class ConsortiumUtility {
  private readonly consortium: Program<Consortium>;
  private readonly keypairs: Secp256k1Keypair[] = [];
  private configPDA: PublicKey;
  epoch : Number;
  height : Number;

	constructor(consortium : Program<Consortium>, initialKeypairs: Secp256k1Keypair[] = []) {
		this.keypairs = initialKeypairs;
		this.consortium = consortium;
		this.configPDA = PublicKey.findProgramAddressSync([Buffer.from("consortium_config")], consortium.programId)[0];
	}

	/**
	 * Add a keypair to the consortium
	 * @param keypair The keypair to add
	 */
	addKeypair(keypair: Secp256k1Keypair): void {
		this.keypairs.push(keypair);
	}

	/**
	 * Add multiple keypairs to the consortium
	 * @param keypairs Array of keypairs to add
	 */
	addKeypairs(keypairs: Secp256k1Keypair[]): void {
		this.keypairs.push(...keypairs);
	}

	/**
	 * Generate and add n new keypairs to the consortium
	 * @param n Number of keypairs to generate and add
	 */
	generateAndAddKeypairs(n: number): void {
		const newKeypairs = generateSecp256k1Keypairs(n);
		this.addKeypairs(newKeypairs);
	}

	/**
	 * Get all keypairs in the consortium
	 * @returns Array of all keypairs
	 */
	getKeypairs(): Secp256k1Keypair[] {
		return [...this.keypairs];
	}

	/**
	 * Get the number of keypairs in the consortium
	 * @returns Number of keypairs
	 */
	getKeypairCount(): number {
		return this.keypairs.length;
	}

	/**
	 * Get a specific keypair by index
	 * @param index Index of the keypair to retrieve
	 * @returns The keypair at the specified index
	 * @throws Error if index is out of bounds
	 */
	getKeypair(index: number): Secp256k1Keypair {
		if (index < 0 || index >= this.keypairs.length) {
			throw new Error(`Index ${index} is out of bounds. Consortium has ${this.keypairs.length} keypairs.`);
		}
		return this.keypairs[index];
	}

	/**
	 * Sign a payload with all keypairs in the consortium
	 * @param payload The byte payload to sign
	 * @returns Array of signatures from all keypairs
	 */
	signPayload(payload: Uint8Array): Signature[] {
		if (this.keypairs.length === 0) {
			throw new Error("Cannot sign payload: Consortium has no keypairs");
		}
		
		return signPayloadWithMultipleKeys(payload, this.keypairs.map(kp => kp.privateKey));
	}

	/**
	 * Sign a payload with a specific subset of keypairs
	 * @param payload The byte payload to sign
	 * @param indices Array of indices of keypairs to use for signing
	 * @returns Array of signatures from the specified keypairs
	 */
	signPayloadWithIndices(payload: Uint8Array, indices: number[]): Signature[] {
		if (indices.length === 0) {
			throw new Error("Cannot sign payload: No keypair indices provided");
		}

		const selectedKeypairs = indices.map(index => {
			if (index < 0 || index >= this.keypairs.length) {
				throw new Error(`Index ${index} is out of bounds. Consortium has ${this.keypairs.length} keypairs.`);
			}
			return this.keypairs[index];
		});

		return signPayloadWithMultipleKeys(payload, selectedKeypairs.map(kp => kp.privateKey));
	}

	/**
	 * Sign a payload with the first n keypairs
	 * @param payload The byte payload to sign
	 * @param count Number of keypairs to use (starting from the first)
	 * @returns Array of signatures from the first n keypairs
	 */
	signPayloadWithFirstN(payload: Uint8Array, count: number): Signature[] {
		if (count <= 0) {
			throw new Error("Count must be greater than 0");
		}
		if (count > this.keypairs.length) {
			throw new Error(`Cannot use ${count} keypairs: Consortium only has ${this.keypairs.length} keypairs`);
		}

		const indices = Array.from({ length: count }, (_, i) => i);
		return this.signPayloadWithIndices(payload, indices);
	}

	/**
	 * Get all public keys in the consortium (for verification purposes)
	 * @returns Array of public keys
	 */
	getPublicKeys(): Uint8Array[] {
		return this.keypairs.map(kp => kp.publicKey);
	}

	/**
	 * Get all public keys in the format expected by Rust (64 bytes each)
	 * @returns Array of 64-byte public keys
	 */
	getPublicKeysAsBytes(): Uint8Array[] {
		return this.keypairs.map(kp => publicKeyToBytes(kp.publicKey));
	}

	/**
	 * Verify signatures against a payload using consortium public keys
	 * @param payload The original payload
	 * @param signatures Array of signatures to verify
	 * @param keypairIndices Optional array of keypair indices to use for verification (defaults to all)
	 * @returns Array of boolean results for each signature
	 */
	verifySignatures(payload: Uint8Array, signatures: Signature[], keypairIndices?: number[]): boolean[] {
		const indices = keypairIndices || Array.from({ length: this.keypairs.length }, (_, i) => i);
		
		if (signatures.length !== indices.length) {
			throw new Error(`Number of signatures (${signatures.length}) must match number of keypair indices (${indices.length})`);
		}

		return signatures.map((signature, i) => {
			const keypairIndex = indices[i];
			if (keypairIndex < 0 || keypairIndex >= this.keypairs.length) {
				throw new Error(`Keypair index ${keypairIndex} is out of bounds`);
			}
			return verifySignature(payload, signature, this.keypairs[keypairIndex].publicKey);
		});
	}

	/**
	 * Clear all keypairs from the consortium
	 */
	clearKeypairs(): void {
		this.keypairs.length = 0;
	}

	/**
	 * Remove a keypair by index
	 * @param index Index of the keypair to remove
	 * @returns The removed keypair
	 */
	removeKeypair(index: number): Secp256k1Keypair {
		if (index < 0 || index >= this.keypairs.length) {
			throw new Error(`Index ${index} is out of bounds. Consortium has ${this.keypairs.length} keypairs.`);
		}
		return this.keypairs.splice(index, 1)[0];
	}

	/**
   * Create a valset payload for the consortium program
   * @param epoch The epoch number
   * @param weightThreshold The weight threshold for consensus
   * @param height The block height
   * @param keypairs
   * @returns The valset payload as a Buffer
   */
	createValSetPayload(epoch: number = 1, weightThreshold: number = 1, height: number = 1, keypairs : Secp256k1Keypair[] = this.keypairs): Buffer {
		if (keypairs.length === 0) {
			throw new Error("Cannot create valset payload: Consortium has no keypairs");
		}

		// Prepare validators data (64-byte public keys)
		const validators = keypairs.map(keypair =>
			`0x${Buffer.from(keypair.publicKey).toString('hex')}`
		);
		
		// Prepare weights (each validator has weight 1)
		const weights = keypairs.map(() => 1);
		
		// Define the ABI types for the tuple (uint256, bytes[], uint256[], uint256, uint256)
		const abiTypes = [
			'uint256', // epoch
			'bytes[]', // validators
			'uint256[]', // weights
			'uint256', // weightThreshold
			'uint256'  // height
		];
		
		// Encode the parameters using ethers ABI coder
		const abiCoder = ethers.AbiCoder.defaultAbiCoder();
		const encodedData = abiCoder.encode(abiTypes, [
			epoch,
			validators,
			weights,
			weightThreshold,
			height
		]);
		
		// Add the consortium selector (0x4aab1d6f) at the beginning
		const selector = '0x4aab1d6f';
		const fullPayload = selector + encodedData.slice(2); // Remove 0x from encoded data
		
		return Buffer.from(fullPayload.slice(2), 'hex');
	}

	/**
	 * Initialize the consortium program and set the initial validator set
	 * @param admin The admin keypair for the consortium
	 * @param epoch Optional epoch number (defaults to 1)
	 * @param weightThreshold Optional weight threshold (defaults to 1)
	 * @param height Optional block height (defaults to 1)
	 * @param deployerWallet Optional deployer wallet (defaults to provider wallet)
	 * @returns Object containing both transaction signatures
	 */
	async initializeConsortiumProgram(
		admin: Keypair,
		epoch: number = 1,
		weightThreshold: number = this.keypairs.length - 1,
		height: number = 1,
		deployerWallet?: anchor.Wallet
	): Promise<{ initializeTx: string; setValSetTx: string }> {
    const program = this.consortium;

		// Use provider wallet if no deployer specified
		const deployer = deployerWallet || program.provider.wallet;

		try {
			// Step 1: Initialize the consortium program
			const initializeTx = await program.methods
				.initialize(admin.publicKey)
				.accounts({
					deployer: deployer.publicKey,
				})
				.signers([deployer.payer])
				.rpc({commitment: "confirmed"});
			
			// Step 2: Set the initial validator set
			const valsetPayload = this.createValSetPayload(epoch, weightThreshold, height);
			
			const setValSetTx = await program.methods
				.setInitialValset(valsetPayload)
				.accounts({
					admin: admin.publicKey,
				})
				.signers([admin])
        .rpc({commitment: "confirmed"});

			// Fetch the config account and check its fields
			const configPDA = this.getConsortiumConfigPDA();
			const config = await program.account.config.fetch(configPDA);

			if (!config) {
				throw new Error("Consortium config account not found after initialization");
			}
			if (!config.admin.equals(admin.publicKey)) {
				throw new Error(`Config admin mismatch: expected ${admin.publicKey.toBase58()}, got ${config.admin.toBase58()}`);
			}
			if (config.currentEpoch.toNumber() !== epoch) {
				throw new Error(`Config epoch mismatch: expected ${epoch}, got ${config.currentEpoch}`);
			}
			if (config.currentWeightThreshold.toNumber() !== weightThreshold) {
				throw new Error(`Config weight threshold mismatch: expected ${weightThreshold}, got ${config.currentWeightThreshold}`);
			}
			
			return {
				initializeTx,
				setValSetTx
			};
		} catch (error) {
			throw new Error(`Failed to initialize consortium program: ${error.message}`);
		}
	}

  async updateValset(valsetPayload : Buffer, payer : Keypair) {

    const valsetPayloadLength = valsetPayload.length;
    const valsetPayloadHash = sha256(valsetPayload).slice(2);
    const valsetPayloadHashBytes = Array.from(Buffer.from(valsetPayloadHash, "hex"));

    const { validatedPayloadPDA } = await this.createAndFinalizeSession(payer, valsetPayload);

    const sessionPayloadPDA = PublicKey.findProgramAddressSync(
      [Buffer.from("session_payload"), payer.publicKey.toBuffer(), Buffer.from(valsetPayloadHash, "hex")],
      this.consortium.programId
    )[0];

    const chunkMaxSize = 512;
    for (let i = 0; i < valsetPayloadLength; i+=chunkMaxSize) {
      const chunk = valsetPayload.subarray(i, Math.min(i+chunkMaxSize, valsetPayloadLength));
      await this.consortium.methods
        .postSessionPayload(valsetPayloadHashBytes, chunk, valsetPayloadLength)
        .accounts({
          payer: payer.publicKey,
          sessionPayload: sessionPayloadPDA,
        })
        .signers([payer])
        .rpc({commitment: "confirmed"});
    }

    await this.consortium.methods
      .updateValset(valsetPayloadHashBytes)
      .accounts({
        payer: payer.publicKey,
        validatedPayload: validatedPayloadPDA,
        sessionPayload: sessionPayloadPDA,
      })
      .signers([payer])
      .rpc({commitment: "confirmed"});
  }

	async createAndFinalizeSession(
		payer: Keypair,
		payload: Buffer
	): Promise<{ validatedPayloadPDA: PublicKey; sessionPDA : PublicKey  }> {

		const payloadSignatures = this.signPayload(payload);
		const payloadHash = Buffer.from(sha256(payload).slice(2), "hex");
		const payloadHashBytes = Array.from(Uint8Array.from(payloadHash));
		const cfg = await this.consortium.account.config.fetch(this.configPDA);
		const currentEpoch = cfg.currentEpoch

		const sessionPDA = PublicKey.findProgramAddressSync(
				[Buffer.from("session"), currentEpoch.toBuffer("le", 8), payer.publicKey.toBuffer(), payloadHash],
		this.consortium.programId
			)[0];

		const validatedPayloadPDA = PublicKey.findProgramAddressSync(
				[Buffer.from("validated_payload"), payloadHash],
		this.consortium.programId
			)[0];

			await this.consortium.methods
				.createSession(payloadHashBytes)
				.accounts({
					payer: payer.publicKey,
					session: sessionPDA,
					validatedPayload: validatedPayloadPDA,
				})
				.signers([payer])
				.rpc({commitment: "confirmed"});

		const indices = [];
		for (let i = 0; i < payloadSignatures.length; i++) {
		console.log(Buffer.concat([payloadSignatures[i].r, payloadSignatures[i].s]).toString('hex'));
		indices.push(new BN(i));
		}

		await this.consortium.methods
			.postSessionSignatures(payloadHashBytes, payloadSignatures.map(s => Array.from(Uint8Array.from(Buffer.concat([s.r, s.s])))), indices)
			.accounts({
				payer: payer.publicKey,
				session: sessionPDA,
			})
			.signers([payer])
			.rpc({commitment: "confirmed"});

				await this.consortium.methods
					.finalizeSession(payloadHashBytes)
					.accounts({
						payer: payer.publicKey,
						session: sessionPDA,
						validatedPayload: validatedPayloadPDA,
					})
					.signers([payer])
			.rpc({commitment: "confirmed"});

		return {
			validatedPayloadPDA,
			sessionPDA
		};
	}

	getValidatedPayloadPDA(payloadHash: Buffer): PublicKey {
		return PublicKey.findProgramAddressSync(
			[Buffer.from("validated_payload"), payloadHash],
			this.consortium.programId
		)[0];
	}

	/**
	 * Get the consortium config PDA
	 * @returns The config PDA public key
	 */
	getConsortiumConfigPDA(): PublicKey {
		const [configPDA] = PublicKey.findProgramAddressSync(
			[Buffer.from("consortium_config")],
      this.consortium.programId
		);
		return configPDA;
	}

	/**
	 * Fetch the consortium config account
	 * @returns The consortium config account data
	 */
	async fetchConsortiumConfig(): Promise<any> {
		const configPDA = this.getConsortiumConfigPDA();
		return await this.consortium.account.config.fetch(configPDA);
	}

	/**
	 * Check if the consortium program is initialized
	 * @returns True if initialized, false otherwise
	 */
	async isConsortiumInitialized(): Promise<boolean> {
		try {
			await this.fetchConsortiumConfig();
			return true;
		} catch (error) {
			return false;
		}
	}

	/**
	 * Check if the consortium has a validator set configured
	 * @returns True if validator set is configured, false otherwise
	 */
	async hasValidatorSet(): Promise<boolean> {
		try {
			const config = await this.fetchConsortiumConfig();
			return config.currentEpoch > 0;
		} catch (error) {
			return false;
		}
	}

	/**
	 * Get the current validator set from the consortium program
	 * @returns Object containing validator set information
	 */
	async getValidatorSet(): Promise<{
		epoch: number;
		validators: Uint8Array[];
		weights: number[];
		weightThreshold: number;
	}> {
		const config = await this.fetchConsortiumConfig();
		return {
			epoch: config.currentEpoch.toNumber(),
			validators: config.currentValidators,
			weights: config.currentWeights.map((w: any) => w.toNumber()),
			weightThreshold: config.currentWeightThreshold.toNumber(),
		};
	}
}

/**
 * Generate n secp256k1 keypairs
 * @param n Number of keypairs to generate
 * @returns Array of secp256k1 keypairs
 */
export function generateSecp256k1Keypairs(n: number): Secp256k1Keypair[] {
  if (n <= 0) {
    throw new Error("Number of keypairs must be greater than 0");
  }

  const keypairs: Secp256k1Keypair[] = [];
  
  for (let i = 0; i < n; i++) {
    const privateKey = secp256k1.utils.randomPrivateKey();
    const publicKey = secp256k1.getPublicKey(privateKey, false); // false = uncompressed (65 bytes)

    keypairs.push({
      privateKey,
      publicKey
    });
  }
  
  return keypairs;
}

/**
 * Sign a generic byte payload with a secp256k1 private key
 * @param payload The byte payload to sign
 * @param privateKey The private key to sign with
 * @returns Signature with recovery ID
 */
export function signPayload(payload: Uint8Array, privateKey: Uint8Array): Signature {
  // Hash the payload using keccak256 (same as used in the Rust code)
  const payloadHash = Buffer.from(sha256(payload).slice(2), "hex");
  
  // Sign the hash
  const signature = secp256k1.sign(payloadHash, privateKey);
  
  // Convert bigint to Uint8Array (32 bytes each)
  const rBytes = new Uint8Array(32);
  const sBytes = new Uint8Array(32);
  
  // Convert bigint to bytes (big-endian)
  const rHex = signature.r.toString(16).padStart(64, '0');
  const sHex = signature.s.toString(16).padStart(64, '0');
  
  for (let i = 0; i < 32; i++) {
    rBytes[i] = parseInt(rHex.substr(i * 2, 2), 16);
    sBytes[i] = parseInt(sHex.substr(i * 2, 2), 16);
  }
  
  return {
    r: rBytes,
    s: sBytes,
    recoveryId: signature.recovery
  };
}

/**
 * Sign a generic byte payload with multiple secp256k1 private keys
 * @param payload The byte payload to sign
 * @param privateKeys Array of private keys to sign with
 * @returns Array of signatures with recovery IDs
 */
export function signPayloadWithMultipleKeys(payload: Uint8Array, privateKeys: Uint8Array[]): Signature[] {
  return privateKeys.map(privateKey => signPayload(payload, privateKey));
}

function uint8ArrayToBigInt(uint8Array: Uint8Array): bigint {
	const buffer = Buffer.from(uint8Array);
	return BigInt('0x' + buffer.toString('hex'));
}

/**
 * Verify a signature against a payload and public key
 * @param payload The original payload
 * @param signature The signature to verify
 * @param publicKey The public key to verify against
 * @returns True if signature is valid, false otherwise
 */
export function verifySignature(payload: Uint8Array, signature: Signature, publicKey: Uint8Array): boolean {
  try {
    const payloadHash = Buffer.from(sha256(payload).slice(2), "hex");
    
		const sigInt = {
			r: uint8ArrayToBigInt(signature.r),
			s: uint8ArrayToBigInt(signature.s)
		}
    
    return secp256k1.verify(sigInt, payloadHash, publicKey);
  } catch (error) {
    return false;
  }
}

/**
 * Convert a signature to the format expected by the Rust code (64 bytes)
 * @param signature The signature to convert
 * @returns 64-byte signature as Uint8Array
 */
export function signatureToBytes(signature: Signature): Uint8Array {
  const result = new Uint8Array(64);
  result.set(signature.r, 0);
  result.set(signature.s, 32);
  return result;
}

/**
 * Convert a public key to the format expected by the Rust code (64 bytes, uncompressed)
 * @param publicKey The public key to convert
 * @returns 64-byte public key as Uint8Array
 */
export function publicKeyToBytes(publicKey: Uint8Array): Uint8Array {
  if (publicKey.length === 65) {
    // Remove the first byte (compression indicator) to get 64 bytes
    return publicKey.slice(1);
  } else if (publicKey.length === 64) {
    return publicKey;
  } else {
    throw new Error(`Invalid public key length: ${publicKey.length}. Expected 64 or 65 bytes.`);
  }
}

export class PayloadDepositV1 {
	chainId: Buffer;
	recipient: PublicKey;
	amount: bigint;
	txId: Buffer;
	vout: number;
	tokenAddress: PublicKey;
	
	constructor(chainId: Buffer, recipient: PublicKey, amount: bigint, txId: Buffer, vout: number, tokenAddress: PublicKey) {
	  this.chainId = chainId;
	  this.recipient = recipient;
	  this.amount = amount;
	  this.txId = txId;
	  this.vout = vout;
	  this.tokenAddress = tokenAddress;
	}
  
	toBuffer(): Buffer {
	  return Buffer.concat([
		Buffer.from(DEPOSIT_V1_SELECTOR, "hex"),
		Buffer.from(ethers.AbiCoder.defaultAbiCoder().encode(
		  ["bytes32", "bytes32", "uint256", "bytes32", "uint32", "bytes32"],
		  [this.chainId, this.recipient.toBuffer(), this.amount, this.txId, this.vout, this.tokenAddress.toBuffer()]
		).slice(2), "hex")
	  ]);
	}
  
	toBytes(): number[] {
	  return Array.from(Uint8Array.from(this.toBuffer()));
	}
  
	toHash(): Buffer {
	  return Buffer.from(sha256(this.toBuffer()).slice(2), "hex");
	}
  
	toHashBytes(): number[] {
	  return Array.from(Uint8Array.from(this.toHash()));
	}
}

export function randomNumber(length : number) : number {
  if (length <= 0) {
    return 0;
  }

  const min = 10 ** (length - 1);
  const max = 10 ** length - 1;

  const range = max - min + 1;
  const rand = Math.floor(Math.random() * range);

  return min + rand;
}