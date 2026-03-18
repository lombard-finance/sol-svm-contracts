import "dotenv/config";
import * as anchor from "@coral-xyz/anchor";
import { BN, Program } from "@coral-xyz/anchor";
import { Keypair, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { BasculeGmp } from "../target/types/bascule_gmp";
import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import { keccak_256 } from "@noble/hashes/sha3";
import { generateSecp256k1Keypairs, signatureToBytes, publicKeyToBytes } from "./consortium_utilities";
import { secp256k1 } from "@noble/curves/secp256k1";

chai.use(chaiAsPromised);
const expect = chai.expect;

/** nonce/amount as 32 bytes (right-aligned big-endian, like uint256). */
function u64To32BeBytes(v: bigint | number): Uint8Array {
  const buf = new Uint8Array(32);
  const view = new DataView(buf.buffer);
  view.setBigUint64(24, BigInt(v), false); // big-endian at offset 24
  return buf;
}

/** Compute mint message id (keccak256 of nonce_32 || token_address || recipient || amount_32). */
function mintMessageId(
  nonce: bigint | number,
  tokenAddress: Uint8Array,
  recipient: Uint8Array,
  amount: bigint | number
): Uint8Array {
  const data = new Uint8Array(128);
  data.set(u64To32BeBytes(nonce), 0);
  data.set(tokenAddress, 32);
  data.set(recipient, 64);
  data.set(u64To32BeBytes(amount), 96);
  return new Uint8Array(keccak_256(data));
}

/** Sign the 32-byte mint message id with secp256k1; returns signature (64 bytes) and recovery_id (0 or 1). */
function signMintMessageId(
  mintMessageIdBytes: Uint8Array,
  privateKey: Uint8Array
): { signature: number[]; recoveryId: number } {
  const sig = secp256k1.sign(mintMessageIdBytes, privateKey);
  const rBytes = new Uint8Array(32);
  const sBytes = new Uint8Array(32);
  const rHex = sig.r.toString(16).padStart(64, "0");
  const sHex = sig.s.toString(16).padStart(64, "0");
  for (let i = 0; i < 32; i++) {
    rBytes[i] = parseInt(rHex.substr(i * 2, 2), 16);
    sBytes[i] = parseInt(sHex.substr(i * 2, 2), 16);
  }
  const sigBytes = signatureToBytes({ r: rBytes, s: sBytes, recoveryId: sig.recovery });
  return {
    signature: Array.from(sigBytes),
    recoveryId: sig.recovery
  };
}

describe("Bascule GMP", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.BasculeGmp as Program<BasculeGmp>;

  let deployer: Keypair;
  let admin: Keypair;
  let reporter: Keypair;
  let validator: Keypair;
  let guardian: Keypair;
  let pauser: Keypair;
  let other: Keypair;
  let configPDA: PublicKey;
  let trustedSignerKeypair: { privateKey: Uint8Array; publicKey: Uint8Array };
  let trustedSignerBytes: number[];

  async function fundWallet(account: Keypair, amount: number) {
    const tx = await provider.connection.requestAirdrop(account.publicKey, amount * LAMPORTS_PER_SOL);
    const lastBlockHash = await provider.connection.getLatestBlockhash();
    await provider.connection.confirmTransaction({
      blockhash: lastBlockHash.blockhash,
      lastValidBlockHeight: lastBlockHash.lastValidBlockHeight,
      signature: tx
    });
  }

  before(async () => {
    deployer = Keypair.generate();
    admin = Keypair.generate();
    reporter = Keypair.generate();
    validator = Keypair.generate();
    guardian = Keypair.generate();
    pauser = Keypair.generate();
    other = Keypair.generate();

    await fundWallet(deployer, 25);
    await fundWallet(admin, 25);
    await fundWallet(reporter, 25);
    await fundWallet(validator, 25);
    await fundWallet(guardian, 25);
    await fundWallet(pauser, 25);
    await fundWallet(other, 25);

    [configPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("bascule_gmp_config")],
      program.programId
    );

    const keypairs = generateSecp256k1Keypairs(1);
    trustedSignerKeypair = keypairs[0];
    trustedSignerBytes = Array.from(publicKeyToBytes(trustedSignerKeypair.publicKey));
  });

  describe("Initialize and admin", () => {
    it("initialize: fails when payer is not deployer", async () => {
      await expect(
        program.methods
          .initialize(admin.publicKey, new BN(1000), trustedSignerBytes)
          .accounts({
            deployer: admin.publicKey,
          })
          .signers([admin])
          .rpc({ commitment: "confirmed" })
      ).to.be.rejected;
    });

    it("initialize: successful", async () => {
      await program.methods
        .initialize(admin.publicKey, new BN(1000), trustedSignerBytes)
        .accounts({
          deployer: provider.wallet.publicKey,
        })
        .signers([Keypair.fromSecretKey(provider.wallet.payer.secretKey)])
        .rpc({ commitment: "confirmed" });

      const cfg = await program.account.config.fetch(configPDA);
      expect(cfg.admin.toBase58()).to.equal(admin.publicKey.toBase58());
      expect(cfg.paused).to.equal(false);
      expect(cfg.validateThreshold.toNumber()).to.equal(1000);
      expect(Array.from(cfg.trustedSigner)).to.deep.equal(trustedSignerBytes);
    });

    it("transferOwnership: failure from unauthorized party", async () => {
      await expect(
        program.methods
          .transferOwnership(other.publicKey)
          .accounts({ admin: other.publicKey })
          .signers([other])
          .rpc({ commitment: "confirmed" })
      ).to.be.rejectedWith("Unauthorized");
    });

    it("transferOwnership and acceptOwnership: successful", async () => {
      await program.methods
        .transferOwnership(other.publicKey)
        .accounts({ admin: admin.publicKey })
        .signers([admin])
        .rpc({ commitment: "confirmed" });

      await program.methods
        .acceptOwnership()
        .accounts({ acceptAdmin: other.publicKey })
        .signers([other])
        .rpc({ commitment: "confirmed" });

      const cfg = await program.account.config.fetch(configPDA);
      expect(cfg.admin.toBase58()).to.equal(other.publicKey.toBase58());

      // transfer back for rest of tests
      await program.methods
        .transferOwnership(admin.publicKey)
        .accounts({ admin: other.publicKey })
        .signers([other])
        .rpc({ commitment: "confirmed" });
      await program.methods
        .acceptOwnership()
        .accounts({ acceptAdmin: admin.publicKey })
        .signers([admin])
        .rpc({ commitment: "confirmed" });
    });
  });

  describe("Roles", () => {
    it("grantAccountRole: successful by admin (MintReporter, MintValidator, ValidationGuardian, Pauser)", async () => {
      await program.methods
        .grantAccountRole(reporter.publicKey, { mintReporter: {} })
        .accounts({
          admin: admin.publicKey,
        })
        .signers([admin])
        .rpc({ commitment: "confirmed" });

      await program.methods
        .grantAccountRole(validator.publicKey, { mintValidator: {} })
        .accounts({
          admin: admin.publicKey,
        })
        .signers([admin])
        .rpc({ commitment: "confirmed" });

      await program.methods
        .grantAccountRole(guardian.publicKey, { validationGuardian: {} })
        .accounts({
          admin: admin.publicKey,
        })
        .signers([admin])
        .rpc({ commitment: "confirmed" });

      await program.methods
        .grantAccountRole(pauser.publicKey, { pauser: {} })
        .accounts({
          admin: admin.publicKey,
        })
        .signers([admin])
        .rpc({ commitment: "confirmed" });
    });

    it("grantAccountRole: rejects when called by not admin", async () => {
      await expect(
        program.methods
          .grantAccountRole(other.publicKey, { mintReporter: {} })
          .accounts({
            admin: other.publicKey,
          })
          .signers([other])
          .rpc({ commitment: "confirmed" })
      ).to.be.rejectedWith("Unauthorized");
    });

    it("revokeAccountRoles: successful by admin", async () => {
      await program.methods
        .grantAccountRole(other.publicKey, { mintReporter: {} })
        .accounts({
          admin: admin.publicKey,
        })
        .signers([admin])
        .rpc({ commitment: "confirmed" });

      await program.methods
        .revokeAccountRoles(other.publicKey)
        .accounts({
          admin: admin.publicKey,
        })
        .signers([admin])
        .rpc({ commitment: "confirmed" });
    });
  });

  describe("Report and validate mint", () => {
    const nonce = 1;
    const amount = 1000;
    let tokenAddress: Uint8Array;
    let recipient: Uint8Array;
    let mintMessage: { nonce: BN; tokenAddress: number[]; recipient: number[]; amount: BN };
    let mintMessageIdBytes: Uint8Array;
    let proof: { signature: number[]; recoveryId: number };

    before(() => {
      tokenAddress = new Uint8Array(32);
      tokenAddress.set(Keypair.generate().publicKey.toBytes(), 0);
      recipient = new Uint8Array(32);
      recipient.set(reporter.publicKey.toBytes(), 0);
      mintMessage = {
        nonce: new BN(nonce),
        tokenAddress: Array.from(tokenAddress),
        recipient: Array.from(recipient),
        amount: new BN(amount)
      };
      mintMessageIdBytes = mintMessageId(nonce, tokenAddress, recipient, amount);
      const signed = signMintMessageId(mintMessageIdBytes, trustedSignerKeypair.privateKey);
      proof = { signature: signed.signature, recoveryId: signed.recoveryId };
    });

    it("reportMint: rejects when proof is invalid (wrong signer)", async () => {
      const wrongKeypairs = generateSecp256k1Keypairs(1);
      const wrongProof = signMintMessageId(mintMessageIdBytes, wrongKeypairs[0].privateKey);
      const [mintPayloadPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("mint_payload"), mintMessageIdBytes],
        program.programId
      );

      await expect(
        program.methods
          .reportMint(mintMessage, {
            signature: wrongProof.signature,
            recoveryId: wrongProof.recoveryId
          })
          .accountsPartial({
            reporter: reporter.publicKey,
            mintPayload: mintPayloadPDA,
          })
          .signers([reporter])
          .rpc({ commitment: "confirmed" })
      ).to.be.rejectedWith("InvalidProof");
    });

    it("reportMint: successful with valid proof", async () => {
      const [mintPayloadPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("mint_payload"), mintMessageIdBytes],
        program.programId
      );

      await program.methods
        .reportMint(mintMessage, proof)
        .accountsPartial({
          reporter: reporter.publicKey,
          mintPayload: mintPayloadPDA,
        })
        .signers([reporter])
        .rpc({ commitment: "confirmed" });

      const mintPayload = await program.account.mintPayload.fetch(mintPayloadPDA);
      expect(mintPayload.state.reported).to.exist;
      expect(mintPayload.amount.toNumber()).to.equal(amount);
    });

    it("reportMint: rejects when mint payload already exists", async () => {
      const [mintPayloadPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("mint_payload"), mintMessageIdBytes],
        program.programId
      );

      await expect(
        program.methods
          .reportMint(mintMessage, proof)
          .accountsPartial({
            reporter: reporter.publicKey,
            mintPayload: mintPayloadPDA,
          })
          .signers([reporter])
          .rpc({ commitment: "confirmed" })
      ).to.be.rejected;
    });

    it("validateMint: successful (Reported -> Minted, amount >= threshold)", async () => {
      const [mintPayloadPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("mint_payload"), mintMessageIdBytes],
        program.programId
      );

      await program.methods
        .validateMint(mintMessage)
        .accountsPartial({
          validator: validator.publicKey,
          mintPayload: mintPayloadPDA,
        })
        .signers([validator])
        .rpc({ commitment: "confirmed" });

      const mintPayload = await program.account.mintPayload.fetch(mintPayloadPDA);
      expect(mintPayload.state.minted).to.exist;
    });

    it("validateMint: rejects when already Minted", async () => {
      const [mintPayloadPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("mint_payload"), mintMessageIdBytes],
        program.programId
      );

      await expect(
        program.methods
          .validateMint(mintMessage)
          .accountsPartial({
            validator: validator.publicKey,
            mintPayload: mintPayloadPDA,
          })
          .signers([validator])
          .rpc({ commitment: "confirmed" })
      ).to.be.rejectedWith("AlreadyMinted");
    });

    it("validateMint: direct Minted when amount < threshold", async () => {
      const nonce2 = 2;
      const amount2 = 50; // below threshold 1000
      const mintMessage2 = {
        nonce: new BN(nonce2),
        tokenAddress: Array.from(tokenAddress),
        recipient: Array.from(recipient),
        amount: new BN(amount2)
      };
      const mintMessageId2 = mintMessageId(nonce2, tokenAddress, recipient, amount2);
      const [mintPayloadPDA2] = PublicKey.findProgramAddressSync(
        [Buffer.from("mint_payload"), mintMessageId2],
        program.programId
      );

      await program.methods
        .validateMint(mintMessage2)
        .accountsPartial({
          validator: validator.publicKey,
          mintPayload: mintPayloadPDA2,
        })
        .signers([validator])
        .rpc({ commitment: "confirmed" });

      const mintPayload = await program.account.mintPayload.fetch(mintPayloadPDA2);
      expect(mintPayload.state.minted).to.exist;
      expect(mintPayload.amount.toNumber()).to.equal(amount2);
    });
  });

  describe("Pause and unpause", () => {
    it("pause: rejects when called by not pauser", async () => {
      await expect(
        program.methods
          .pause()
          .accounts({
            pauser: other.publicKey,
          })
          .signers([other])
          .rpc({ commitment: "confirmed" })
      ).to.be.rejected;
    });

    it("pause: successful by pauser", async () => {
      await program.methods
        .pause()
        .accounts({
          pauser: pauser.publicKey,
        })
        .signers([pauser])
        .rpc({ commitment: "confirmed" });

      const cfg = await program.account.config.fetch(configPDA);
      expect(cfg.paused).to.equal(true);
    });

    it("unpause: rejects when called by not admin", async () => {
      await expect(
        program.methods
          .unpause()
          .accounts({ admin: pauser.publicKey })
          .signers([pauser])
          .rpc({ commitment: "confirmed" })
      ).to.be.rejectedWith("Unauthorized");
    });

    it("unpause: successful by admin", async () => {
      await program.methods
        .unpause()
        .accounts({ admin: admin.publicKey })
        .signers([admin])
        .rpc({ commitment: "confirmed" });

      const cfg = await program.account.config.fetch(configPDA);
      expect(cfg.paused).to.equal(false);
    });
  });

  describe("Update validate threshold", () => {
    it("updateValidateThreshold: rejects when called by not ValidationGuardian", async () => {
      await expect(
        program.methods
          .updateValidateThreshold(new BN(500))
          .accounts({
            guardian: reporter.publicKey,
          })
          .signers([reporter])
          .rpc({ commitment: "confirmed" })
      ).to.be.rejectedWith("Unauthorized");
    });

    it("updateValidateThreshold: successful by ValidationGuardian", async () => {
      await program.methods
        .updateValidateThreshold(new BN(2000))
        .accounts({
          guardian: guardian.publicKey,
        })
        .signers([guardian])
        .rpc({ commitment: "confirmed" });

      const cfg = await program.account.config.fetch(configPDA);
      expect(cfg.validateThreshold.toNumber()).to.equal(2000);
    });
  });
});
