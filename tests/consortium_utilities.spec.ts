import { generateSecp256k1Keypairs, signPayload, verifySignature, signatureToBytes, publicKeyToBytes, signPayloadWithMultipleKeys } from "./consortium_utilities";
import { expect } from "chai";
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Keypair } from "@solana/web3.js";
import { Consortium as ConsortiumProgram } from "../target/types/consortium";
import { ConsortiumUtility } from "./consortium_utilities";


/**
 * Mocha test suite for consortium utilities
 */
describe("Consortium Utilities", () => {
    describe("Basic cryptographic functions", () => {
      it("should generate secp256k1 keypairs", () => {
        const keypairs = generateSecp256k1Keypairs(3);
        expect(keypairs).to.have.length(3);
        keypairs.forEach(keypair => {
          expect(keypair.privateKey).to.have.length(32);
          expect(keypair.publicKey).to.have.length(65);
        });
      });
  
      it("should sign and verify payloads", () => {
        const keypairs = generateSecp256k1Keypairs(1);
        const payload = new TextEncoder().encode("Hello, Consortium!");
        
        const signature = signPayload(payload, keypairs[0].privateKey);
        expect(signature).to.have.property('r');
        expect(signature).to.have.property('s');
        expect(signature).to.have.property('recoveryId');
        expect(signature.r).to.have.length(32);
        expect(signature.s).to.have.length(32);
        
        const isValid = verifySignature(payload, signature, keypairs[0].publicKey);
        expect(isValid).to.be.true;
      });
  
      it("should convert signature to bytes format", () => {
        const keypairs = generateSecp256k1Keypairs(1);
        const payload = new TextEncoder().encode("Test payload");
        const signature = signPayload(payload, keypairs[0].privateKey);
        
        const signatureBytes = signatureToBytes(signature);
        expect(signatureBytes).to.have.length(64);
      });
  
      it("should convert public key to bytes format", () => {
        const keypairs = generateSecp256k1Keypairs(1);
        const publicKeyBytes = publicKeyToBytes(keypairs[0].publicKey);
        expect(publicKeyBytes).to.have.length(64);
      });
  
      it("should sign payloads with multiple keys", () => {
        const keypairs = generateSecp256k1Keypairs(3);
        const payload = new TextEncoder().encode("Multi-key test");
        
        const signatures = signPayloadWithMultipleKeys(payload, keypairs.map(kp => kp.privateKey));
        expect(signatures).to.have.length(3);
        
        signatures.forEach((signature, index) => {
          const isValid = verifySignature(payload, signature, keypairs[index].publicKey);
          expect(isValid).to.be.true;
        });
      });
    });
  
    describe("Consortium class functionality", () => {
      let consortium: ConsortiumUtility;
      let payload: Uint8Array;
  
      beforeEach(() => {
        consortium = new ConsortiumUtility();
        payload = new TextEncoder().encode("Consortium Test Payload");
      });
  
      it("should start with zero keypairs", () => {
        expect(consortium.getKeypairCount()).to.equal(0);
      });
  
      it("should generate and add keypairs", () => {
        consortium.generateAndAddKeypairs(5);
        expect(consortium.getKeypairCount()).to.equal(5);
      });
  
      it("should sign payloads with all keypairs", () => {
        consortium.generateAndAddKeypairs(3);
        const signatures = consortium.signPayload(payload);
        expect(signatures).to.have.length(3);
      });
  
      it("should sign payloads with first N keypairs", () => {
        consortium.generateAndAddKeypairs(5);
        const signatures = consortium.signPayloadWithFirstN(payload, 3);
        expect(signatures).to.have.length(3);
      });
  
      it("should sign payloads with specific indices", () => {
        consortium.generateAndAddKeypairs(5);
        const signatures = consortium.signPayloadWithIndices(payload, [0, 2, 4]);
        expect(signatures).to.have.length(3);
      });
  
      it("should verify signatures correctly", () => {
        consortium.generateAndAddKeypairs(3);
        const signatures = consortium.signPayload(payload);
        const verificationResults = consortium.verifySignatures(payload, signatures);
        
        expect(verificationResults).to.have.length(3);
        verificationResults.forEach(result => {
          expect(result).to.be.true;
        });
      });
  
      it("should retrieve public keys in correct format", () => {
        consortium.generateAndAddKeypairs(3);
        const publicKeys = consortium.getPublicKeysAsBytes();
        
        expect(publicKeys).to.have.length(3);
        publicKeys.forEach(pk => {
          expect(pk).to.have.length(64);
        });
      });
  
      it("should remove keypairs by index", () => {
        consortium.generateAndAddKeypairs(3);
        const initialCount = consortium.getKeypairCount();
        
        const removedKeypair = consortium.removeKeypair(0);
        expect(consortium.getKeypairCount()).to.equal(initialCount - 1);
        expect(removedKeypair).to.have.property('privateKey');
        expect(removedKeypair).to.have.property('publicKey');
      });
  
      it("should clear all keypairs", () => {
        consortium.generateAndAddKeypairs(5);
        expect(consortium.getKeypairCount()).to.equal(5);
        
        consortium.clear();
        expect(consortium.getKeypairCount()).to.equal(0);
      });
  
      it("should throw error when signing with empty consortium", () => {
        expect(() => consortium.signPayload(payload)).to.throw("Cannot sign payload: Consortium has no keypairs");
      });
  
      it("should throw error when accessing out of bounds index", () => {
        consortium.generateAndAddKeypairs(2);
        expect(() => consortium.getKeypair(5)).to.throw("Index 5 is out of bounds");
      });
    });
  
    describe("Consortium program initialization", () => {
      let provider: anchor.AnchorProvider;
      let program: Program<ConsortiumProgram>;
      let consortium: ConsortiumUtility;
      let adminKeypair: Keypair;
  
      before(async () => {
        provider = anchor.AnchorProvider.env();
        anchor.setProvider(provider);
        program = anchor.workspace.Consortium as Program<ConsortiumProgram>;
        
        consortium = new ConsortiumUtility();
        consortium.generateAndAddKeypairs(3);
        adminKeypair = Keypair.generate();
      });
  
      it("should initialize consortium program successfully", async () => {
        const result = await consortium.initializeConsortiumProgram(program, adminKeypair);
        
        expect(result).to.have.property('initializeTx');
        expect(result).to.have.property('setValSetTx');
        expect(result.initializeTx).to.be.a('string');
        expect(result.setValSetTx).to.be.a('string');
      });
  
      it("should have correct admin in config after initialization", async () => {
        const config = await consortium.fetchConsortiumConfig(program);
        expect(config.admin.toBase58()).to.equal(adminKeypair.publicKey.toBase58());
      });
  
      it("should have validator set configured after initialization", async () => {
        const hasValSet = await consortium.hasValidatorSet(program);
        expect(hasValSet).to.be.true;
      });
  
      it("should have correct validator set data", async () => {
        const valSet = await consortium.getValidatorSet(program);
        
        expect(valSet.epoch.toString()).to.equal(1n.toString());
        expect(valSet.validators).to.have.length(3);
        expect(valSet.weightThreshold.toString()).to.equal(1n.toString());
        expect(valSet.weights).to.have.length(3);
        valSet.weights.forEach(weight => {
          expect(weight.toString()).to.equal(1n.toString());
        });
      });
  
      it("should have matching public keys in validator set", async () => {
        const valSet = await consortium.getValidatorSet(program);
        const ourPublicKeys = consortium.getPublicKeysAsBytes();
        
        expect(ourPublicKeys).to.have.length(valSet.validators.length);
      });
  
      it("should detect if consortium is initialized", async () => {
        const isInitialized = await consortium.isConsortiumInitialized(program);
        expect(isInitialized).to.be.true;
      });
    });
  });