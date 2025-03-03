import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Lbtc } from "../target/types/lbtc";
import * as spl from "@solana/spl-token";
import * as fs from "fs";
import { sha256 } from "js-sha256";
import nacl from "tweetnacl";
import chai, { expect } from "chai";
import chaiAsPromised from "chai-as-promised";
import type { PublicKey, Keypair } from "@solana/web3.js";

chai.use(chaiAsPromised);

const web3 = require("@solana/web3.js");
const assert = require("assert");

// probably need to clean this up real good before sending it out

describe("LBTC", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.Lbtc as Program<Lbtc>;

  let payer: Keypair;
  let user: Keypair;
  let admin: Keypair;
  let operator: Keypair;
  let pauser: Keypair;
  let configPDA: Keypair;
  let treasury: Keypair;
  const mintKeys = web3.Keypair.fromSeed(Uint8Array.from(Array(32).fill(5)));
  let mint: PublicKey;
  let recipient: Keypair;
  let recipientTA: Keypair;
  const tokenAuth = web3.PublicKey.findProgramAddressSync([Buffer.from("token_authority")], program.programId)[0];
  let metadata_seed = new Uint8Array(32);
  for (let i = 0; i < metadata_seed.length; i++) {
    metadata_seed[i] = 1;
  }

  // Utility function for airdrops
  async function fundWallet(account, amount) {
    const publicKey = account.publicKey ? account.publicKey : account;

    const tx = await provider.connection.requestAirdrop(publicKey, amount);
    const lastBlockHash = await provider.connection.getLatestBlockhash();

    await provider.connection.confirmTransaction({
      blockhash: lastBlockHash.blockhash,
      lastValidBlockHeight: lastBlockHash.lastValidBlockHeight,
      signature: tx,
      nonceAccountPubkey: publicKey
    });
  }

  payer = web3.Keypair.generate();
  user = web3.Keypair.generate();
  admin = web3.Keypair.generate();
  operator = web3.Keypair.generate();
  pauser = web3.Keypair.generate();
  const t = web3.Keypair.generate();
  recipient = web3.Keypair.fromSeed(Uint8Array.from(Array(32).fill(4)));

  before(async () => {
    await fundWallet(payer, 25 * web3.LAMPORTS_PER_SOL);
    await fundWallet(user, 25 * web3.LAMPORTS_PER_SOL);
    await fundWallet(admin, 25 * web3.LAMPORTS_PER_SOL);
    await fundWallet(operator, 25 * web3.LAMPORTS_PER_SOL);
    await fundWallet(t, 25 * web3.LAMPORTS_PER_SOL);
    await fundWallet(recipient, 25 * web3.LAMPORTS_PER_SOL);

    mint = await spl.createMint(provider.connection, admin, tokenAuth, null, 8, mintKeys);
    [configPDA] = web3.PublicKey.findProgramAddressSync([Buffer.from("lbtc_config")], program.programId);

    treasury = await spl.createAssociatedTokenAccount(provider.connection, t, mint, t.publicKey);

    recipientTA = await spl.createAssociatedTokenAccount(provider.connection, recipient, mint, recipient.publicKey);
  });

  describe("Setters and getters", () => {
    it("initializes with the admin and mint", async () => {
      const tx = await program.methods
        .initialize(admin.publicKey, mint)
        .accounts({
          payer: payer.publicKey,
          config: configPDA,
          systemProgram: web3.SystemProgram.programId
        })
        .signers([payer])
        .rpc();
      await provider.connection.confirmTransaction(tx);
      const cfg = await program.account.config.fetch(configPDA);
      assert.equal(cfg.admin.toBase58(), admin.publicKey.toBase58());
    });

    it("allows admin to toggle withdrawals", async () => {
      const tx = await program.methods
        .disableWithdrawals()
        .accounts({ payer: admin.publicKey, config: configPDA })
        .signers([admin])
        .rpc();
      await provider.connection.confirmTransaction(tx);
      const cfg = await program.account.config.fetch(configPDA);
      assert.equal(cfg.withdrawalsEnabled, false);

      const tx2 = await program.methods
        .enableWithdrawals()
        .accounts({ payer: admin.publicKey, config: configPDA })
        .signers([admin])
        .rpc();
      await provider.connection.confirmTransaction(tx2);
      const cfg2 = await program.account.config.fetch(configPDA);
      assert.equal(cfg2.withdrawalsEnabled, true);
    });

    it("should not allow anyone else to enable withdrawals", async () => {
      await expect(
        program.methods
          .enableWithdrawals()
          .accounts({ payer: payer.publicKey, config: configPDA })
          .signers([payer])
          .rpc()
      ).to.be.rejectedWith("An address constraint was violated");
    });

    it("should not allow anyone else to disable withdrawals", async () => {
      await expect(
        program.methods
          .disableWithdrawals()
          .accounts({ payer: payer.publicKey, config: configPDA })
          .signers([payer])
          .rpc()
      ).to.be.rejectedWith("An address constraint was violated");
    });

    it("allows admin to toggle bascule", async () => {
      const tx = await program.methods
        .enableBascule()
        .accounts({ payer: admin.publicKey, config: configPDA })
        .signers([admin])
        .rpc();
      await provider.connection.confirmTransaction(tx);
      const cfg = await program.account.config.fetch(configPDA);
      assert.equal(cfg.basculeEnabled, true);

      const tx2 = await program.methods
        .disableBascule()
        .accounts({ payer: admin.publicKey, config: configPDA })
        .signers([admin])
        .rpc();
      await provider.connection.confirmTransaction(tx2);
    });

    it("should not allow anyone else to enable bascule", async () => {
      await expect(
        program.methods
          .enableBascule()
          .accounts({
            payer: payer.publicKey,
            config: configPDA
          })
          .signers([payer])
          .rpc()
      ).to.be.rejectedWith("An address constraint was violated");
    });

    it("should not allow anyone else to disable bascule", async () => {
      await expect(
        program.methods
          .disableBascule()
          .accounts({
            payer: payer.publicKey,
            config: configPDA
          })
          .signers([payer])
          .rpc()
      ).to.be.rejectedWith("An address constraint was violated");
    });

    it("allows operator to set mint fee", async () => {
      const tx = await program.methods
        .setOperator(operator.publicKey)
        .accounts({ payer: admin.publicKey, config: configPDA })
        .signers([admin])
        .rpc();
      await provider.connection.confirmTransaction(tx);
      let cfg = await program.account.config.fetch(configPDA);
      assert.equal(cfg.operator.toBase58(), operator.publicKey.toBase58());

      const mintFee = new anchor.BN(10);
      const tx2 = await program.methods
        .setMintFee(mintFee)
        .accounts({ payer: operator.publicKey, config: configPDA })
        .signers([operator])
        .rpc();
      await provider.connection.confirmTransaction(tx2);
      cfg = await program.account.config.fetch(configPDA);
      expect(cfg.mintFee.eq(mintFee));
    });

    it("should not allow anyone else to set mint fee", async () => {
      const mintFee = new anchor.BN(10);
      await expect(
        program.methods
          .setMintFee(mintFee)
          .accounts({ payer: payer.publicKey, config: configPDA })
          .signers([payer])
          .rpc()
      ).to.be.rejectedWith("An address constraint was violated");
    });

    it("allows admin to set burn commission", async () => {
      const burnCommission = new anchor.BN(10);
      const tx = await program.methods
        .setBurnCommission(burnCommission)
        .accounts({ payer: admin.publicKey, config: configPDA })
        .signers([admin])
        .rpc();
      await provider.connection.confirmTransaction(tx);
      const cfg = await program.account.config.fetch(configPDA);
      expect(cfg.burnCommission.eq(burnCommission));
    });

    it("should not allow anyone else to set burn commission", async () => {
      const burnCommission = new anchor.BN(10);
      await expect(
        program.methods
          .setBurnCommission(burnCommission)
          .accounts({ payer: payer.publicKey, config: configPDA })
          .signers([payer])
          .rpc()
      ).to.be.rejectedWith("An address constraint was violated");
    });

    it("allows admin to set operator", async () => {
      const tx = await program.methods
        .setOperator(operator.publicKey)
        .accounts({ payer: admin.publicKey, config: configPDA })
        .signers([admin])
        .rpc();
      await provider.connection.confirmTransaction(tx);
      const cfg = await program.account.config.fetch(configPDA);
      expect(cfg.operator.toBase58() == operator.publicKey.toBase58());
    });

    it("should not allow anyone else to set operator", async () => {
      await expect(
        program.methods
          .setOperator(payer.publicKey)
          .accounts({ payer: payer.publicKey, config: configPDA })
          .signers([payer])
          .rpc()
      ).to.be.rejectedWith("An address constraint was violated");
    });

    it("allows admin to set dust fee rate", async () => {
      const dustFeeRate = new anchor.BN(3000);
      const tx = await program.methods
        .setDustFeeRate(dustFeeRate)
        .accounts({ payer: admin.publicKey, config: configPDA })
        .signers([admin])
        .rpc();
      await provider.connection.confirmTransaction(tx);
      const cfg = await program.account.config.fetch(configPDA);
      expect(cfg.dustFeeRate.eq(dustFeeRate));
    });

    it("should not allow anyone else to set dust fee rate", async () => {
      const dustFeeRate = new anchor.BN(3000);
      await expect(
        program.methods
          .setDustFeeRate(dustFeeRate)
          .accounts({ payer: payer.publicKey, config: configPDA })
          .signers([payer])
          .rpc()
      ).to.be.rejectedWith("An address constraint was violated");
    });

    it("should not allow anyone else to set treasury", async () => {
      await expect(
        program.methods
          .setTreasury(treasury)
          .accounts({ payer: payer.publicKey, config: configPDA })
          .signers([payer])
          .rpc()
      ).to.be.rejectedWith("An address constraint was violated");
    });

    it("allows admin to set treasury", async () => {
      const tx = await program.methods
        .setTreasury(treasury)
        .accounts({ payer: admin.publicKey, config: configPDA })
        .signers([admin])
        .rpc();
      await provider.connection.confirmTransaction(tx);
      const cfg = await program.account.config.fetch(configPDA);
      expect(cfg.treasury.toBase58() == treasury.toBase58());
    });

    it("allows admin to add minter", async () => {
      const minter = web3.Keypair.generate();
      const tx = await program.methods
        .addMinter(minter.publicKey)
        .accounts({ payer: admin.publicKey, config: configPDA })
        .signers([admin])
        .rpc();
      await provider.connection.confirmTransaction(tx);
      const cfg = await program.account.config.fetch(configPDA);
      expect(cfg.minters[0].toBase58() == minter.publicKey.toBase58());
    });

    it("should not allow anyone else to add minter", async () => {
      const minter = web3.Keypair.generate();
      await expect(
        program.methods
          .addMinter(minter.publicKey)
          .accounts({ payer: payer.publicKey, config: configPDA })
          .signers([payer])
          .rpc()
      ).to.be.rejectedWith("An address constraint was violated");
    });

    it("allows admin to add claimer", async () => {
      const claimer = web3.Keypair.generate();
      const tx = await program.methods
        .addClaimer(claimer.publicKey)
        .accounts({ payer: admin.publicKey, config: configPDA })
        .signers([admin])
        .rpc();
      await provider.connection.confirmTransaction(tx);
      const cfg = await program.account.config.fetch(configPDA);
      expect(cfg.claimers[0].toBase58() == claimer.publicKey.toBase58());
    });

    it("should not allow anyone else to add claimer", async () => {
      const claimer = web3.Keypair.generate();
      await expect(
        program.methods
          .addClaimer(claimer.publicKey)
          .accounts({ payer: payer.publicKey, config: configPDA })
          .signers([payer])
          .rpc()
      ).to.be.rejectedWith("An address constraint was violated");
    });

    it("allows admin to add pauser", async () => {
      const tx = await program.methods
        .addPauser(pauser.publicKey)
        .accounts({ payer: admin.publicKey, config: configPDA })
        .signers([admin])
        .rpc();
      await provider.connection.confirmTransaction(tx);
      const cfg = await program.account.config.fetch(configPDA);
      expect(cfg.pausers[0].toBase58() == pauser.publicKey.toBase58());
    });

    it("allows pauser to pause", async () => {
      const tx2 = await program.methods
        .pause()
        .accounts({ payer: pauser.publicKey, config: configPDA })
        .signers([pauser])
        .rpc();
      await provider.connection.confirmTransaction(tx2);
      const cfg = await program.account.config.fetch(configPDA);
      expect(cfg.paused == true);
    });

    it("should not allow anyone else to unpause", async () => {
      const cfg = await program.account.config.fetch(configPDA);
      expect(cfg.paused == true);
      await expect(
        program.methods.unpause().accounts({ payer: payer.publicKey, config: configPDA }).signers([payer]).rpc()
      ).to.be.rejectedWith("An address constraint was violated");
    });

    it("allows admin to unpause", async () => {
      const tx = await program.methods
        .unpause()
        .accounts({ payer: admin.publicKey, config: configPDA })
        .signers([admin])
        .rpc();
      await provider.connection.confirmTransaction(tx);
      const cfg = await program.account.config.fetch(configPDA);
      expect(cfg.paused == false);
    });

    it("should not allow anyone else to add pauser", async () => {
      await expect(
        program.methods
          .addPauser(payer.publicKey)
          .accounts({ payer: payer.publicKey, config: configPDA })
          .signers([payer])
          .rpc()
      ).to.be.rejectedWith("An address constraint was violated");
    });

    it("should not allow anyone else to pause", async () => {
      await expect(
        program.methods.pause().accounts({ payer: payer.publicKey, config: configPDA }).signers([payer]).rpc()
      ).to.be.rejectedWith("Unauthorized function call");
    });
  });

  describe("Consortium actions", () => {
    const initialValset = Buffer.from(
      "4aab1d6f000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000a00000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000004000000000000000000000000000000000000000000000000000000000000000c0000000000000000000000000000000000000000000000000000000000000004104ba5734d8f7091719471e7f7ed6b9df170dc70cc661ca05e688601ad984f068b0d67351e5f06073092499336ab0839ef8a521afd334e53807205fa2f08eec74f4000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000041049d9031e97dd78ff8c15aa86939de9b1e791066a0224e331bc962a2099a7b1f0464b8bbafe1535f2301c72c2cb3535b172da30b02686ab0393d348614f157fbdb00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000001",
      "hex"
    );
    const nextValset = Buffer.from(
      "4aab1d6f000000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000a000000000000000000000000000000000000000000000000000000000000002a0000000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000003000000000000000000000000000000000000000000000000000000000000006000000000000000000000000000000000000000000000000000000000000000e00000000000000000000000000000000000000000000000000000000000000160000000000000000000000000000000000000000000000000000000000000004104ba5734d8f7091719471e7f7ed6b9df170dc70cc661ca05e688601ad984f068b0d67351e5f06073092499336ab0839ef8a521afd334e53807205fa2f08eec74f4000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000041049d9031e97dd78ff8c15aa86939de9b1e791066a0224e331bc962a2099a7b1f0464b8bbafe1535f2301c72c2cb3535b172da30b02686ab0393d348614f157fbdb0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000410420b871f3ced029e14472ec4ebc3c0448164942b123aa6af91a3386c1c403e0ebd3b4a5752a2b6c49e574619e6aa0549eb9ccd036b9bbc507e1f7f9712a236092000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000003000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000001",
      "hex"
    );
    const signatures = Buffer.from(
      "0x00000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000004000000000000000000000000000000000000000000000000000000000000000a00000000000000000000000000000000000000000000000000000000000000040dd9cbefb2570d94d82095766a142e7f3eb115313f364db7c0fa01ac246aca5ff3654b5f6dbcdbfe086c86e5e7ae8e5178986944dafb077303a99e2bd75663c8600000000000000000000000000000000000000000000000000000000000000407474df436d805d9bce1ae640e7802c88e655496f008f428fd953f623a054d7782841f70a5c4ffa6da53ea661762967eb628b81ad6a8d6321f83fb66884855e3a",
      "hex"
    );

    const hash = sha256(initialValset);
    const hash2 = sha256(nextValset);
    const metadataPDA = web3.PublicKey.findProgramAddressSync(
      [Buffer.from(hash, "hex"), metadata_seed, admin.publicKey.toBuffer()],
      program.programId
    )[0];
    const validators = [
      Buffer.from(
        "ba5734d8f7091719471e7f7ed6b9df170dc70cc661ca05e688601ad984f068b0d67351e5f06073092499336ab0839ef8a521afd334e53807205fa2f08eec74f4",
        "hex"
      ),
      Buffer.from(
        "9d9031e97dd78ff8c15aa86939de9b1e791066a0224e331bc962a2099a7b1f0464b8bbafe1535f2301c72c2cb3535b172da30b02686ab0393d348614f157fbdb",
        "hex"
      )
    ];
    const validators2 = [
      Buffer.from(
        "ba5734d8f7091719471e7f7ed6b9df170dc70cc661ca05e688601ad984f068b0d67351e5f06073092499336ab0839ef8a521afd334e53807205fa2f08eec74f4",
        "hex"
      ),
      Buffer.from(
        "9d9031e97dd78ff8c15aa86939de9b1e791066a0224e331bc962a2099a7b1f0464b8bbafe1535f2301c72c2cb3535b172da30b02686ab0393d348614f157fbdb",
        "hex"
      ),
      Buffer.from(
        "20b871f3ced029e14472ec4ebc3c0448164942b123aa6af91a3386c1c403e0ebd3b4a5752a2b6c49e574619e6aa0549eb9ccd036b9bbc507e1f7f9712a236092",
        "hex"
      )
    ];
    const weights = [new anchor.BN(1), new anchor.BN(1)];
    const weights2 = [new anchor.BN(1), new anchor.BN(1), new anchor.BN(1)];

    const sigs = [
      Buffer.from(
        "dd9cbefb2570d94d82095766a142e7f3eb115313f364db7c0fa01ac246aca5ff3654b5f6dbcdbfe086c86e5e7ae8e5178986944dafb077303a99e2bd75663c86",
        "hex"
      ),
      Buffer.from(
        "7474df436d805d9bce1ae640e7802c88e655496f008f428fd953f623a054d7782841f70a5c4ffa6da53ea661762967eb628b81ad6a8d6321f83fb66884855e3a",
        "hex"
      )
    ];
    const wrongSigs = [
      Buffer.from(
        "ad9cbefb2570d94d82095766a142e7f3eb115313f364db7c0fa01ac246aca5ff3654b5f6dbcdbfe086c86e5e7ae8e5178986944dafb077303a99e2bd75663c86",
        "hex"
      ),
      Buffer.from(
        "a474df436d805d9bce1ae640e7802c88e655496f008f428fd953f623a054d7782841f70a5c4ffa6da53ea661762967eb628b81ad6a8d6321f83fb66884855e3a",
        "hex"
      )
    ];

    const payloadPDA = web3.PublicKey.findProgramAddressSync(
      [Buffer.from(hash, "hex"), admin.publicKey.toBuffer()],
      program.programId
    )[0];

    it("should allow anyone to construct metadata", async () => {
      const tx = await program.methods
        .createMetadataForValsetPayload(Buffer.from(hash, "hex"))
        .accounts({
          payer: admin.publicKey,
          metadata: metadataPDA
        })
        .signers([admin])
        .rpc();
      await provider.connection.confirmTransaction(tx);
    });

    it("should not allow someone else to add metadata other than creator", async () => {
      await expect(
        program.methods
          .postMetadataForValsetPayload(Buffer.from(hash, "hex"), validators, weights)
          .accounts({
            payer: admin.publicKey,
            metadata: metadataPDA
          })
          .signers([payer])
          .rpc()
      ).to.be.rejectedWith(`unknown signer: ${payer.publicKey.toBase58()}`);
    });

    it("should allow the creator to post metadata", async () => {
      const tx2 = await program.methods
        .postMetadataForValsetPayload(Buffer.from(hash, "hex"), validators, weights)
        .accounts({
          payer: admin.publicKey,
          metadata: metadataPDA
        })
        .signers([admin])
        .rpc();
      await provider.connection.confirmTransaction(tx2);
    });

    it("should not allow another person to create validator set payload for someone's metadata", async () => {
      await expect(
        program.methods
          .createValsetPayload(Buffer.from(hash, "hex"), new anchor.BN(1), new anchor.BN(1), new anchor.BN(1))
          .accounts({
            payer: admin.publicKey,
            config: configPDA,
            metadata: metadataPDA,
            payload: payloadPDA
          })
          .signers([payer])
          .rpc()
      ).to.be.rejectedWith(`unknown signer: ${payer.publicKey.toBase58()}`);
    });

    it("should allow metadata creator to create a validator set payload", async () => {
      let tx = await program.methods
        .createValsetPayload(Buffer.from(hash, "hex"), new anchor.BN(1), new anchor.BN(1), new anchor.BN(1))
        .accounts({
          payer: admin.publicKey,
          config: configPDA,
          metadata: metadataPDA,
          payload: payloadPDA
        })
        .signers([admin])
        .rpc();
      await provider.connection.confirmTransaction(tx);
    });

    it("should not allow non-admin to set initial valset", async () => {
      const metadataPDA2 = web3.PublicKey.findProgramAddressSync(
        [Buffer.from(hash, "hex"), metadata_seed, payer.publicKey.toBuffer()],
        program.programId
      )[0];
      const payloadPDA2 = web3.PublicKey.findProgramAddressSync(
        [Buffer.from(hash, "hex"), payer.publicKey.toBuffer()],
        program.programId
      )[0];

      const tx = await program.methods
        .createMetadataForValsetPayload(Buffer.from(hash, "hex"))
        .accounts({
          payer: payer.publicKey,
          metadata: metadataPDA2
        })
        .signers([payer])
        .rpc();
      await provider.connection.confirmTransaction(tx);

      const tx2 = await program.methods
        .postMetadataForValsetPayload(Buffer.from(hash, "hex"), validators, weights)
        .accounts({
          payer: payer.publicKey,
          metadata: metadataPDA2
        })
        .signers([payer])
        .rpc();
      await provider.connection.confirmTransaction(tx2);

      const tx3 = await program.methods
        .createValsetPayload(Buffer.from(hash, "hex"), new anchor.BN(1), new anchor.BN(1), new anchor.BN(1))
        .accounts({
          payer: payer.publicKey,
          config: configPDA,
          metadata: metadataPDA2,
          payload: payloadPDA2
        })
        .signers([payer])
        .rpc();
      await provider.connection.confirmTransaction(tx3);

      await expect(
        program.methods
          .setInitialValset(Buffer.from(hash, "hex"))
          .accounts({ payer: payer.publicKey, config: configPDA })
          .signers([payer])
          .rpc()
      ).to.be.rejectedWith("An address constraint was violated");
    });

    it("should allow admin to set initial valset", async () => {
      const tx4 = await program.methods
        .setInitialValset(Buffer.from(hash, "hex"))
        .accounts({ payer: admin.publicKey, config: configPDA })
        .signers([admin])
        .rpc();
      await provider.connection.confirmTransaction(tx4);

      const cfg = await program.account.config.fetch(configPDA);
      expect(cfg.epoch == 1);
      expect(cfg.validators[0] == validators[0]);
      expect(cfg.validators[1] == validators[1]);
      expect(cfg.weights == [1, 1]);
      expect(cfg.weight_threshold == 1);
    });

    it("should not allow setting initial valset twice", async () => {
      const metadataPDA2 = web3.PublicKey.findProgramAddressSync(
        [Buffer.from(hash2, "hex"), metadata_seed, admin.publicKey.toBuffer()],
        program.programId
      )[0];
      const payloadPDA2 = web3.PublicKey.findProgramAddressSync(
        [Buffer.from(hash2, "hex"), admin.publicKey.toBuffer()],
        program.programId
      )[0];

      const tx = await program.methods
        .createMetadataForValsetPayload(Buffer.from(hash2, "hex"))
        .accounts({
          payer: admin.publicKey,
          metadata: metadataPDA2
        })
        .signers([admin])
        .rpc();
      await provider.connection.confirmTransaction(tx);

      const tx2 = await program.methods
        .postMetadataForValsetPayload(Buffer.from(hash2, "hex"), validators2, weights2)
        .accounts({
          payer: admin.publicKey,
          metadata: metadataPDA2
        })
        .signers([admin])
        .rpc();
      await provider.connection.confirmTransaction(tx2);

      const tx3 = await program.methods
        .createValsetPayload(Buffer.from(hash2, "hex"), new anchor.BN(2), new anchor.BN(2), new anchor.BN(1))
        .accounts({
          payer: admin.publicKey,
          config: configPDA,
          metadata: metadataPDA2,
          payload: payloadPDA2
        })
        .signers([admin])
        .rpc();
      await provider.connection.confirmTransaction(tx3);

      await expect(
        program.methods
          .setInitialValset(Buffer.from(hash2, "hex"))
          .accounts({ payer: admin.publicKey, config: configPDA })
          .signers([admin])
          .rpc()
      ).to.be.rejectedWith("Validator set already set");
    });

    it("should not allow setting next valset without proper signatures", async () => {
      const metadataPDA2 = web3.PublicKey.findProgramAddressSync(
        [Buffer.from(hash2, "hex"), metadata_seed, payer.publicKey.toBuffer()],
        program.programId
      )[0];
      const payloadPDA2 = web3.PublicKey.findProgramAddressSync(
        [Buffer.from(hash2, "hex"), payer.publicKey.toBuffer()],
        program.programId
      )[0];

      const tx = await program.methods
        .createMetadataForValsetPayload(Buffer.from(hash2, "hex"))
        .accounts({
          payer: payer.publicKey,
          metadata: metadataPDA2
        })
        .signers([payer])
        .rpc();
      await provider.connection.confirmTransaction(tx);

      const tx2 = await program.methods
        .postMetadataForValsetPayload(Buffer.from(hash2, "hex"), validators2, weights2)
        .accounts({
          payer: payer.publicKey,
          metadata: metadataPDA2
        })
        .signers([payer])
        .rpc();
      await provider.connection.confirmTransaction(tx2);

      const tx3 = await program.methods
        .createValsetPayload(Buffer.from(hash2, "hex"), new anchor.BN(2), new anchor.BN(2), new anchor.BN(1))
        .accounts({
          payer: payer.publicKey,
          config: configPDA,
          metadata: metadataPDA2,
          payload: payloadPDA2
        })
        .signers([payer])
        .rpc();
      await provider.connection.confirmTransaction(tx3);

      await expect(
        program.methods
          .setNextValset(Buffer.from(hash2, "hex"))
          .accounts({
            payer: payer.publicKey,
            config: configPDA,
            metadata: metadataPDA2,
            payload: payloadPDA2
          })
          .signers([payer])
          .rpc()
      ).to.be.rejectedWith("Not enough valid signatures");
    });

    it("should not allow adding wrong signatures", async () => {
      const metadataPDA2 = web3.PublicKey.findProgramAddressSync(
        [Buffer.from(hash2, "hex"), metadata_seed, payer.publicKey.toBuffer()],
        program.programId
      )[0];
      const payloadPDA2 = web3.PublicKey.findProgramAddressSync(
        [Buffer.from(hash2, "hex"), payer.publicKey.toBuffer()],
        program.programId
      )[0];
      const payload = await program.account.valsetPayload.fetch(payloadPDA2);
      assert.equal(payload.weight, 0);

      const tx = await program.methods
        .postValsetSignatures(Buffer.from(hash2, "hex"), wrongSigs, [new anchor.BN(0), new anchor.BN(1)])
        .accounts({
          payer: payer.publicKey,
          config: configPDA,
          payload: payloadPDA2
        })
        .signers([payer])
        .rpc();
      await provider.connection.confirmTransaction(tx);

      const payload2 = await program.account.valsetPayload.fetch(payloadPDA2);
      assert.equal(payload2.weight, 0);
    });

    it("should not allow for double-adding signatures", async () => {
      const metadataPDA2 = web3.PublicKey.findProgramAddressSync(
        [Buffer.from(hash2, "hex"), metadata_seed, payer.publicKey.toBuffer()],
        program.programId
      )[0];
      const payloadPDA2 = web3.PublicKey.findProgramAddressSync(
        [Buffer.from(hash2, "hex"), payer.publicKey.toBuffer()],
        program.programId
      )[0];

      const tx = await program.methods
        .postValsetSignatures(Buffer.from(hash2, "hex"), [sigs[0]], [new anchor.BN(0)])
        .accounts({
          payer: payer.publicKey,
          config: configPDA,
          payload: payloadPDA2
        })
        .signers([payer])
        .rpc();
      await provider.connection.confirmTransaction(tx);

      const payload = await program.account.valsetPayload.fetch(payloadPDA2);
      assert.equal(payload.weight, 1);

      const tx2 = await program.methods
        .postValsetSignatures(Buffer.from(hash2, "hex"), [sigs[0]], [new anchor.BN(0)])
        .accounts({
          payer: payer.publicKey,
          config: configPDA,
          payload: payloadPDA2
        })
        .signers([payer])
        .rpc();
      await provider.connection.confirmTransaction(tx2);

      const payload2 = await program.account.valsetPayload.fetch(payloadPDA2);
      assert.equal(payload2.weight, 1);
    });

    it("should allow to set next valset with proper signatures", async () => {
      const metadataPDA2 = web3.PublicKey.findProgramAddressSync(
        [Buffer.from(hash2, "hex"), metadata_seed, payer.publicKey.toBuffer()],
        program.programId
      )[0];
      const payloadPDA2 = web3.PublicKey.findProgramAddressSync(
        [Buffer.from(hash2, "hex"), payer.publicKey.toBuffer()],
        program.programId
      )[0];
      const payload = await program.account.valsetPayload.fetch(payloadPDA2);
      assert.equal(payload.weight, 1);

      const tx = await program.methods
        .postValsetSignatures(Buffer.from(hash2, "hex"), sigs, [new anchor.BN(0), new anchor.BN(1)])
        .accounts({
          payer: payer.publicKey,
          config: configPDA,
          payload: payloadPDA2
        })
        .signers([payer])
        .rpc();
      await provider.connection.confirmTransaction(tx);

      const payload2 = await program.account.valsetPayload.fetch(payloadPDA2);
      assert.equal(payload2.weight, 2);

      const tx4 = await program.methods
        .setNextValset(Buffer.from(hash2, "hex"))
        .accounts({
          payer: payer.publicKey,
          config: configPDA,
          metadata: metadataPDA2,
          payload: payloadPDA2
        })
        .signers([payer])
        .rpc();
      await provider.connection.confirmTransaction(tx4);
    });
  });

  describe("Minting and redeeming", () => {
    let userTA: PublicKey;
    let minterTA: PublicKey;
    const minter = web3.Keypair.generate();

    const scriptPubkey = [0, 20, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2];

    class MintPayload {
      prefix: string;
      chainId: string;
      destinationAddress: string;
      amount: string;
      txId: string;
      vout: string;

      constructor(hex: string) {
        this.prefix = hex.slice(0, 8);
        this.chainId = hex.slice(8, 72);
        this.destinationAddress = hex.slice(72, 136);
        this.amount = hex.slice(136, 200);
        this.txId = hex.slice(200, 264);
        this.vout = hex.slice(264);
      }

      hex(): string {
        return this.prefix + this.chainId + this.destinationAddress + this.amount + this.txId + this.vout;
      }

      bytes(): Buffer {
        return Buffer.from(this.hex(), "hex");
      }

      hash(): string {
        return sha256(this.bytes());
      }

      hashAsBytes(): Buffer {
        return Buffer.from(this.hash(), "hex");
      }
    }

    const mintPayload = new MintPayload(
      "f2e73f7c0259db5080fc2c6d3bcf7ca90712d3c2e5e6c28f27f0dfbb9953bdb0894c03abd55cad4b145c9fa6f0c634827d2d3a889bcd4e6e6a9527a89b2f8259bfcbc8f8000000000000000000000000000000000000000000000000000000000000271000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000"
    );
    // const mintHash = sha256(mintPayload);

    // Index 0 and 2
    const mintSigs = [
      Buffer.from(
        "b70c5823843bc2ad3b86ea83c1b8a0972ee21ecd81f54f88c35da9a4c3d881927b377d38800a37213b0c919a54d576ebfa0579d7bc3b1b94474133ba3c4465c0",
        "hex"
      ),
      Buffer.from(
        "0f2a4435f4ca1773c16c84ad6ed209eb806cd1ea052d42eac6cb47a9fcf699d802a47e8d288e9d0eddb95f83ccd74062871d9f8d7faf4ee23fda80bc839dd5fc",
        "hex"
      )
    ];

    const mintPayload2 = Buffer.from(
      "f2e73f7c0259db5080fc2c6d3bcf7ca90712d3c2e5e6c28f27f0dfbb9953bdb0894c03abd55cad4b145c9fa6f0c634827d2d3a889bcd4e6e6a9527a89b2f8259bfcbc8f80000000000000000000000000000000000000000000000000000000000004e2000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000",
      "hex"
    );
    const mintHash2 = sha256(mintPayload2);

    const mintSigs2 = [
      Buffer.from(
        "b88022c1f81803c7d4b7e03a7ea03da40ac4d305fb531695b7a620d99d1a95b80ec9f3b36bf1d30778ff089f5cf267f108b01ae1bbf39315ea83dcaab12d4f49",
        "hex"
      ),
      Buffer.from(
        "cee02758d818b78d192408119e6ae17b60d1a23839bcfd2c993070eb17dacdbd68c58339ba01580b0f6174a2af5ac221095df03566696ede4c6656c93caa0ed3",
        "hex"
      )
    ];

    const feePayload = Buffer.from(
      "04acbbb20259db5080fc2c6d3bcf7ca90712d3c2e5e6c28f27f0dfbb9953bdb0894c03ab42ed4c495cbedc8a5d4b213fe18ba748ebe91264b9a64bea611054af21ad0a8d000000000000000000000000000000000000000000000000000000000000000300000000000000000000000000000000000000000000000000000000ffffffff",
      "hex"
    );
    const feePayloadSig = nacl.sign.detached(feePayload, recipient.secretKey);

    const mintPayloadPDA = web3.PublicKey.findProgramAddressSync([mintPayload.hashAsBytes()], program.programId)[0];
    const mintPayloadPDA2 = web3.PublicKey.findProgramAddressSync(
      [Buffer.from(mintHash2, "hex")],
      program.programId
    )[0];

    before(async () => {
      userTA = await spl.createAssociatedTokenAccount(provider.connection, user, mint, user.publicKey);
      console.log("userTA: ", userTA.toBase58());

      await fundWallet(minter, 25 * web3.LAMPORTS_PER_SOL);
      const tx = await program.methods
        .addMinter(minter.publicKey)
        .accounts({ payer: admin.publicKey, config: configPDA })
        .signers([admin])
        .rpc();
      await provider.connection.confirmTransaction(tx);

      minterTA = await spl.createAssociatedTokenAccount(provider.connection, minter, mint, minter.publicKey);
      console.log("minterTA: ", minterTA.toBase58());
    });

    it("mint: rejects when called by not a minter", async () => {
      await expect(
        program.methods
          .mint(new anchor.BN(1000))
          .accounts({
            payer: user.publicKey,
            config: configPDA,
            recipient: userTA,
            mint: mint,
            tokenAuthority: tokenAuth,
            tokenProgram: spl.TOKEN_PROGRAM_ID
          })
          .signers([user])
          .rpc()
      ).to.be.rejectedWith("Unauthorized function call");
    });

    it("mint: minter can mint to any token account", async () => {
      const amount = new anchor.BN(1000);
      const tx = await program.methods
        .mint(amount)
        .accounts({
          payer: minter.publicKey,
          config: configPDA,
          recipient: userTA,
          mint: mint,
          tokenAuthority: tokenAuth,
          tokenProgram: spl.TOKEN_PROGRAM_ID
        })
        .signers([minter])
        .rpc();
      await provider.connection.confirmTransaction(tx);

      const balanceAfter = await spl.getAccount(provider.connection, userTA);
      console.log("balance after:", balanceAfter.amount);
      expect(balanceAfter.amount).to.be.eq(BigInt(amount.toString(10)));
    });

    it("burn: rejects when called by not a minter", async () => {
      await expect(
        program.methods
          .burn(new anchor.BN(1000))
          .accounts({
            payer: user.publicKey,
            config: configPDA,
            recipient: userTA,
            mint: mint,
            tokenProgram: spl.TOKEN_PROGRAM_ID
          })
          .signers([user])
          .rpc()
      ).to.be.rejectedWith("Unauthorized function call");
    });

    // NOTE: minters can only burn from their own wallets.
    it("burn: minter can only burn from their own address", async () => {
      let tx = await program.methods
        .mint(new anchor.BN(2000))
        .accounts({
          payer: minter.publicKey,
          config: configPDA,
          recipient: minterTA,
          mint: mint,
          tokenAuthority: tokenAuth,
          tokenProgram: spl.TOKEN_PROGRAM_ID
        })
        .signers([minter])
        .rpc();
      await provider.connection.confirmTransaction(tx);

      const balanceBefore = await spl.getAccount(provider.connection, minterTA);
      console.log("balance before:", balanceBefore.amount);

      const burnAmount = new anchor.BN(1234);
      tx = await program.methods
        .burn(burnAmount)
        .accounts({
          payer: minter.publicKey,
          config: configPDA,
          recipient: minterTA,
          mint: mint,
          tokenProgram: spl.TOKEN_PROGRAM_ID
        })
        .signers([minter])
        .rpc();
      await provider.connection.confirmTransaction(tx);

      const balanceAfter = await spl.getAccount(provider.connection, minterTA);
      console.log("balance after:", balanceAfter.amount);
      expect(balanceBefore.amount - balanceAfter.amount).to.be.eq(BigInt(burnAmount.toString(10)));
    });

    const invalid_payloads = [
      {
        name: "Invalid prefix",
        modifier: (payload: MintPayload): [Buffer, Buffer] => {
          payload.prefix = "f2e73f7d";
          return [payload.bytes(), payload.hashAsBytes()];
        },
        error: "Invalid action bytes"
      },
      {
        name: "Invalid chain id",
        modifier: (payload: MintPayload): [Buffer, Buffer] => {
          payload.chainId = "d55cad4b145c9fa6f0c634827d2d3a889bcd4e6e6a9527a89b2f8259bfcbc8f9";
          return [payload.bytes(), payload.hashAsBytes()];
        },
        error: "Invalid chain ID"
      },
      {
        name: "Hash does not match payload",
        modifier: (payload: MintPayload): [Buffer, Buffer] => {
          payload.vout = "0000000000000000000000000000000000000000000000000000000000000001";
          return [payload.bytes(), mintPayload.hashAsBytes()];
        },
        error: "Passed mint payload hash does not match computed hash"
      }
    ];

    invalid_payloads.forEach(function (arg) {
      it(`createMintPayload: rejects when ${arg.name}`, async () => {
        const [payload, hash] = arg.modifier(
          new MintPayload(
            "f2e73f7c0259db5080fc2c6d3bcf7ca90712d3c2e5e6c28f27f0dfbb9953bdb0894c03abd55cad4b145c9fa6f0c634827d2d3a889bcd4e6e6a9527a89b2f8259bfcbc8f8000000000000000000000000000000000000000000000000000000000000271000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000"
          )
        );
        console.log(payload.toString("hex"));
        const pda = web3.PublicKey.findProgramAddressSync([hash], program.programId)[0];
        await expect(
          program.methods
            .createMintPayload(hash, payload)
            .accounts({
              payer: payer.publicKey,
              config: configPDA,
              payload: pda
            })
            .signers([payer])
            .rpc()
        ).to.be.rejectedWith(arg.error);
      });
    });

    it("createMintPayload: anyone can call", async () => {
      const tx = await program.methods
        .createMintPayload(mintPayload.hashAsBytes(), mintPayload.bytes())
        .accounts({
          payer: payer.publicKey,
          config: configPDA,
          payload: mintPayloadPDA
        })
        .signers([payer])
        .rpc();
      await provider.connection.confirmTransaction(tx);
    });

    it("createMintPayload: rejects when payload already created", async () => {
      await expect(
        program.methods
          .createMintPayload(mintPayload.hashAsBytes(), mintPayload.bytes())
          .accounts({
            payer: payer.publicKey,
            config: configPDA,
            payload: mintPayloadPDA
          })
          .signers([payer])
          .rpc()
      ).to.be.rejectedWith("Transaction simulation failed: Error processing Instruction 0: custom program error: 0x0");
    });

    it("should not allow to mint without proper signatures", async () => {
      await expect(
        program.methods
          .mintFromPayload(mintPayload.hashAsBytes())
          .accounts({
            config: configPDA,
            tokenProgram: spl.TOKEN_PROGRAM_ID,
            recipient: recipientTA,
            mint: mint,
            tokenAuthority: tokenAuth,
            payload: mintPayloadPDA,
            bascule: payer.publicKey
          })
          .signers([payer])
          .rpc()
      ).to.be.rejectedWith("An address constraint was violated");
    });

    it("should not allow for double-adding signatures", async () => {
      const tx = await program.methods
        .postMintSignatures(mintPayload.hashAsBytes(), [mintSigs[0]], [new anchor.BN(0)])
        .accounts({ config: configPDA, payload: mintPayloadPDA })
        .rpc();
      await provider.connection.confirmTransaction(tx);

      const payload = await program.account.mintPayload.fetch(mintPayloadPDA);
      assert.equal(payload.weight, 1);

      const tx2 = await program.methods
        .postMintSignatures(mintPayload.hashAsBytes(), [mintSigs[0]], [new anchor.BN(0)])
        .accounts({ config: configPDA, payload: mintPayloadPDA })
        .rpc();
      await provider.connection.confirmTransaction(tx2);

      const payload2 = await program.account.mintPayload.fetch(mintPayloadPDA);
      assert.equal(payload2.weight, 1);
    });

    it("should allow anyone to post signatures for mint payload", async () => {
      const tx = await program.methods
        .postMintSignatures(mintPayload.hashAsBytes(), mintSigs, [new anchor.BN(0), new anchor.BN(2)])
        .accounts({ config: configPDA, payload: mintPayloadPDA })
        .rpc();
      await provider.connection.confirmTransaction(tx);
    });

    it("should allow to mint with proper signatures", async () => {
      const tx = await program.methods
        .mintFromPayload(mintPayload.hashAsBytes())
        .accounts({
          config: configPDA,
          tokenProgram: spl.TOKEN_PROGRAM_ID,
          recipient: recipientTA,
          mint: mint,
          tokenAuthority: tokenAuth,
          payload: mintPayloadPDA,
          bascule: payer.publicKey
        })
        .rpc();
      await provider.connection.confirmTransaction(tx);
    });

    it("should not allow non-claimer to mint with fee", async () => {
      const tx = await program.methods
        .createMintPayload(Buffer.from(mintHash2, "hex"), mintPayload2)
        .accounts({
          payer: payer.publicKey,
          config: configPDA,
          payload: mintPayloadPDA2
        })
        .signers([payer])
        .rpc();
      await provider.connection.confirmTransaction(tx);

      const tx2 = await program.methods
        .postMintSignatures(Buffer.from(mintHash2, "hex"), mintSigs2, [new anchor.BN(0), new anchor.BN(2)])
        .accounts({ config: configPDA, payload: mintPayloadPDA2 })
        .rpc();
      await provider.connection.confirmTransaction(tx2);

      await expect(
        program.methods
          .mintWithFee(Buffer.from(mintHash2, "hex"), feePayload, Buffer.from(feePayloadSig))
          .accounts({
            payer: payer.publicKey,
            config: configPDA,
            tokenProgram: spl.TOKEN_PROGRAM_ID,
            recipientAuth: recipient.publicKey,
            recipient: recipientTA,
            mint: mint,
            tokenAuthority: tokenAuth,
            treasury: treasury,
            payload: mintPayloadPDA2,
            bascule: payer.publicKey
          })
          .signers([payer])
          .rpc()
      ).to.be.rejectedWith("Unauthorized function call");
    });

    it("should allow claimer to mint with fee to wrong treasury", async () => {
      let tx = await program.methods
        .mintWithFee(Buffer.from(mintHash2, "hex"), feePayload, Buffer.from(feePayloadSig))
        .accounts({
          payer: minter.publicKey,
          config: configPDA,
          tokenProgram: spl.TOKEN_PROGRAM_ID,
          recipientAuth: recipient.publicKey,
          recipient: recipientTA,
          mint: mint,
          tokenAuthority: tokenAuth,
          treasury: recipientTA,
          payload: mintPayloadPDA2,
          bascule: payer.publicKey
        })
        .signers([minter])
        .rpc();
      await provider.connection.confirmTransaction(tx);
    });

    it("should allow claimer to mint with fee", async () => {
      const tx = await program.methods
        .addClaimer(minter.publicKey)
        .accounts({ payer: admin.publicKey, config: configPDA })
        .signers([admin])
        .rpc();
      await provider.connection.confirmTransaction(tx);

      const tx2 = await program.methods
        .mintWithFee(Buffer.from(mintHash2, "hex"), feePayload, Buffer.from(feePayloadSig))
        .accounts({
          payer: minter.publicKey,
          config: configPDA,
          tokenProgram: spl.TOKEN_PROGRAM_ID,
          recipientAuth: recipient.publicKey,
          recipient: recipientTA,
          mint: mint,
          tokenAuthority: tokenAuth,
          treasury: treasury,
          payload: mintPayloadPDA2,
          bascule: payer.publicKey
        })
        .signers([minter])
        .rpc();
      await provider.connection.confirmTransaction(tx2);
    });

    it("should not allow user to redeem if they don't have enough LBTC", async () => {
      await expect(
        program.methods
          .redeem(Buffer.from(scriptPubkey), new anchor.BN(2000))
          .accounts({
            payer: user.publicKey,
            holder: userTA,
            config: configPDA,
            tokenProgram: spl.TOKEN_PROGRAM_ID,
            mint: mint,
            treasury: treasury
          })
          .signers([user])
          .rpc()
      ).to.be.rejectedWith("An address constraint was violated");
    });

    it("should not allow user to redeem below burn commission", async () => {
      await expect(
        program.methods
          .redeem(Buffer.from(scriptPubkey), new anchor.BN(10))
          .accounts({
            payer: user.publicKey,
            holder: userTA,
            config: configPDA,
            tokenProgram: spl.TOKEN_PROGRAM_ID,
            mint: mint,
            treasury: treasury
          })
          .signers([user])
          .rpc()
      ).to.be.rejectedWith("Fee is greater than or equal to amount");
    });

    it("should not allow user to redeem below dust limit", async () => {
      await expect(
        program.methods
          .redeem(Buffer.from(scriptPubkey), new anchor.BN(304))
          .accounts({
            payer: user.publicKey,
            holder: userTA,
            config: configPDA,
            tokenProgram: spl.TOKEN_PROGRAM_ID,
            mint: mint,
            treasury: treasury
          })
          .signers([user])
          .rpc()
      ).to.be.rejectedWith("Redeemed amount is below the BTC dust limit");
    });

    it("should not allow user to redeem to invalid script pubkey", async () => {
      await expect(
        program.methods
          .redeem(Buffer.from([0, 1, 2]), new anchor.BN(1000))
          .accounts({
            payer: user.publicKey,
            holder: userTA,
            config: configPDA,
            tokenProgram: spl.TOKEN_PROGRAM_ID,
            mint: mint,
            treasury: treasury
          })
          .signers([user])
          .rpc()
      ).to.be.rejectedWith("Script pubkey is unsupported");
    });

    it("should not allow user to redeem when withdrawals are disabled", async () => {
      const tx = await program.methods
        .disableWithdrawals()
        .accounts({ payer: admin.publicKey, config: configPDA })
        .signers([admin])
        .rpc();
      await provider.connection.confirmTransaction(tx);

      await expect(
        program.methods
          .redeem(Buffer.from(scriptPubkey), new anchor.BN(1000))
          .accounts({
            payer: user.publicKey,
            holder: userTA,
            config: configPDA,
            tokenProgram: spl.TOKEN_PROGRAM_ID,
            mint: mint,
            treasury: treasury
          })
          .signers([user])
          .rpc()
      ).to.be.rejectedWith("Withdrawals are disabled");

      const tx3 = await program.methods
        .enableWithdrawals()
        .accounts({ payer: admin.publicKey, config: configPDA })
        .signers([admin])
        .rpc();
      await provider.connection.confirmTransaction(tx3);
    });

    it("should not allow user to redeem with improper treasury", async () => {
      await expect(
        program.methods
          .redeem(Buffer.from(scriptPubkey), new anchor.BN(1000))
          .accounts({
            payer: user.publicKey,
            holder: userTA,
            config: configPDA,
            tokenProgram: spl.TOKEN_PROGRAM_ID,
            mint: mint,
            treasury: userTA
          })
          .signers([user])
          .rpc()
      ).to.be.rejectedWith("Withdrawals are disabled");
    });

    it("should allow user to redeem", async () => {
      const tx = await program.methods
        .redeem(Buffer.from(scriptPubkey), new anchor.BN(1000))
        .accounts({
          payer: user.publicKey,
          holder: userTA,
          config: configPDA,
          tokenProgram: spl.TOKEN_PROGRAM_ID,
          mint: mint,
          treasury: treasury
        })
        .signers([user])
        .rpc();
      await provider.connection.confirmTransaction(tx);
    });
  });
});
