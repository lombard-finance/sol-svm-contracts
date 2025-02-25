import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Lbtc } from "../target/types/lbtc";
import * as spl from "@solana/spl-token";
import * as fs from "fs";
import { sha256 } from "js-sha256";

const web3 = require("@solana/web3.js");
const assert = require("assert");
const expect = require("chai").expect;

// TODO proper error checking????
// probably need to clean this up real good before sending it out

describe("LBTC", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.Lbtc as Program<Lbtc>;

  let payer;
  let user;
  let admin;
  let operator;
  let configPDA;
  let treasury;
  const mintKeys = web3.Keypair.fromSeed(Uint8Array.from(Array(32).fill(5)));
  let mint;
  let recipient;
  let recipientTA;
  const tokenAuth = web3.PublicKey.findProgramAddressSync(
    [Buffer.from("token_authority")],
    program.programId
  )[0];
  let metadata_seed = new Uint8Array(32);
  for (let i = 0; i < metadata_seed.length; i++) {
    metadata_seed[i] = 1;
  }

  // Utility function for airdrops
  async function fundWallet(account, amount) {
    const publicKey = account.publicKey ? account.publicKey : account;

    await provider.connection.confirmTransaction(
      await provider.connection.requestAirdrop(publicKey, amount),
      "confirmed"
    );
  }

  payer = web3.Keypair.generate();
  user = web3.Keypair.generate();
  admin = web3.Keypair.generate();
  operator = web3.Keypair.generate();
  const t = web3.Keypair.generate();
  recipient = web3.Keypair.fromSeed(Uint8Array.from(Array(32).fill(4)));

  before(async () => {
    await fundWallet(payer, 25 * web3.LAMPORTS_PER_SOL);
    await fundWallet(user, 25 * web3.LAMPORTS_PER_SOL);
    await fundWallet(admin, 25 * web3.LAMPORTS_PER_SOL);
    await fundWallet(operator, 25 * web3.LAMPORTS_PER_SOL);
    await fundWallet(t, 25 * web3.LAMPORTS_PER_SOL);
    await fundWallet(recipient, 25 * web3.LAMPORTS_PER_SOL);

    mint = await spl.createMint(
      provider.connection,
      admin,
      tokenAuth,
      null,
      8,
      mintKeys
    );
    [configPDA] = web3.PublicKey.findProgramAddressSync(
      [Buffer.from("lbtc_config")],
      program.programId
    );

    treasury = await spl.createAssociatedTokenAccount(
      provider.connection,
      t,
      mint,
      t.publicKey
    );

    recipientTA = await spl.createAssociatedTokenAccount(
      provider.connection,
      recipient,
      mint,
      recipient.publicKey
    );
  });

  describe("Setters and getters", () => {
    it("initializes with the admin", async () => {
      const tx = await program.methods
        .initialize(admin.publicKey)
        .accounts({
          payer: payer.publicKey,
          config: configPDA,
          systemProgram: web3.SystemProgram.programId,
        })
        .signers([payer])
        .rpc();
      await provider.connection.confirmTransaction(tx);
      const cfg = await program.account.config.fetch(configPDA);
      assert.equal(cfg.admin.toBase58(), admin.publicKey.toBase58());
    });

    it("allows admin to toggle withdrawals", async () => {
      const tx = await program.methods
        .toggleWithdrawals()
        .accounts({ payer: admin.publicKey, config: configPDA })
        .signers([admin])
        .rpc();
      await provider.connection.confirmTransaction(tx);
      const cfg = await program.account.config.fetch(configPDA);
      assert.equal(cfg.withdrawalsEnabled, true);
    });

    it("should not allow anyone else to toggle withdrawals", async () => {
      try {
        const tx = await program.methods
          .toggleWithdrawals()
          .accounts({ payer: payer.publicKey, config: configPDA })
          .signers([payer])
          .rpc();
        assert.fail("should not be allowed");
      } catch (e) {}
    });

    it("allows admin to toggle bascule", async () => {
      const tx = await program.methods
        .toggleBascule()
        .accounts({ payer: admin.publicKey, config: configPDA })
        .signers([admin])
        .rpc();
      await provider.connection.confirmTransaction(tx);
      const cfg = await program.account.config.fetch(configPDA);
      assert.equal(cfg.basculeEnabled, true);
    });

    it("should not allow anyone else to toggle bascule", async () => {
      try {
        const tx = await program.methods
          .toggleBascule()
          .accounts({ payer: payer.publicKey, config: configPDA })
          .signers([payer])
          .rpc();
        assert.fail("should not be allowed");
      } catch (e) {}
    });

    it("allows operator to set mint fee", async () => {
      const tx = await program.methods
        .setOperator(operator.publicKey)
        .accounts({ payer: admin.publicKey, config: configPDA })
        .signers([admin])
        .rpc();
      await provider.connection.confirmTransaction(tx);

      const mintFee = new anchor.BN(10);
      const tx2 = await program.methods
        .setMintFee(mintFee)
        .accounts({ payer: operator.publicKey, config: configPDA })
        .signers([operator])
        .rpc();
      await provider.connection.confirmTransaction(tx2);
      const cfg = await program.account.config.fetch(configPDA);
      expect(cfg.mintFee.eq(mintFee));
    });

    it("should not allow anyone else to set mint fee", async () => {
      try {
        const tx = await program.methods
          .setOperator(operator.publicKey)
          .accounts({ payer: admin.publicKey, config: configPDA })
          .signers([admin])
          .rpc();
        await provider.connection.confirmTransaction(tx);

        const mintFee = new anchor.BN(10);
        const tx2 = await program.methods
          .setMintFee(mintFee)
          .accounts({ payer: payer.publicKey, config: configPDA })
          .signers([payer])
          .rpc();
        assert.fail("should not be allowed");
      } catch (e) {}
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
      try {
        const burnCommission = new anchor.BN(10);
        const tx = await program.methods
          .setBurnCommission(burnCommission)
          .accounts({ payer: payer.publicKey, config: configPDA })
          .signers([payer])
          .rpc();
        assert.fail("should not be allowed");
      } catch (e) {}
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
      try {
        const tx = await program.methods
          .setOperator(operator.publicKey)
          .accounts({ payer: payer.publicKey, config: configPDA })
          .signers([payer])
          .rpc();
        assert.fail("should not be allowed");
      } catch (e) {}
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
      try {
        const dustFeeRate = new anchor.BN(3000);
        const tx = await program.methods
          .setDustFeeRate(dustFeeRate)
          .accounts({ payer: payer.publicKey, config: configPDA })
          .signers([payer])
          .rpc();
        assert.fail("should not be allowed");
      } catch (e) {}
    });

    it("should not allow anyone else to set treasury", async () => {
      try {
        const tx = await program.methods
          .setTreasury(treasury)
          .accounts({ payer: payer.publicKey, config: configPDA })
          .signers([payer])
          .rpc();
        assert.fail("should not be allowed");
      } catch (e) {}
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
      try {
        const minter = web3.Keypair.generate();
        const tx = await program.methods
          .addMinter(minter.publicKey)
          .accounts({ payer: payer.publicKey, config: configPDA })
          .signers([payer])
          .rpc();
        assert.fail("should not be allowed");
      } catch (e) {}
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
      try {
        const claimer = web3.Keypair.generate();
        const tx = await program.methods
          .addClaimer(claimer.publicKey)
          .accounts({ payer: payer.publicKey, config: configPDA })
          .signers([payer])
          .rpc();
        assert.fail("should not be allowed");
      } catch (e) {}
    });

    it("allows admin to add pauser", async () => {
      const pauser = web3.Keypair.generate();
      const tx = await program.methods
        .addPauser(pauser.publicKey)
        .accounts({ payer: admin.publicKey, config: configPDA })
        .signers([admin])
        .rpc();
      await provider.connection.confirmTransaction(tx);
      const cfg = await program.account.config.fetch(configPDA);
      expect(cfg.pausers[0].toBase58() == pauser.publicKey.toBase58());
    });

    it("should not allow anyone else to add pauser", async () => {
      try {
        const pauser = web3.Keypair.generate();
        const tx = await program.methods
          .addPauser(pauser.publicKey)
          .accounts({ payer: payer.publicKey, config: configPDA })
          .signers([payer])
          .rpc();
        assert.fail("should not be allowed");
      } catch (e) {}
    });

    it("should not allow anyone else to pause", async () => {
      try {
        const tx = await program.methods
          .pause()
          .accounts({ payer: payer.publicKey, config: configPDA })
          .signers([payer])
          .rpc();
        assert.fail("should not be allowed");
      } catch (e) {}
    });

    it("allows pauser to pause", async () => {
      const pauser = web3.Keypair.generate();
      const tx = await program.methods
        .addPauser(pauser.publicKey)
        .accounts({ payer: admin.publicKey, config: configPDA })
        .signers([admin])
        .rpc();
      await provider.connection.confirmTransaction(tx);

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
      const pauser = web3.Keypair.generate();
      const tx = await program.methods
        .addPauser(pauser.publicKey)
        .accounts({ payer: admin.publicKey, config: configPDA })
        .signers([admin])
        .rpc();
      await provider.connection.confirmTransaction(tx);

      const tx2 = await program.methods
        .pause()
        .accounts({ payer: pauser.publicKey, config: configPDA })
        .signers([pauser])
        .rpc();
      await provider.connection.confirmTransaction(tx2);
      const cfg = await program.account.config.fetch(configPDA);
      expect(cfg.paused == true);
      try {
        const tx3 = await program.methods
          .unpause()
          .accounts({ payer: payer.publicKey, config: configPDA })
          .signers([payer])
          .rpc();
        assert.fail("should not be allowed");
      } catch (e) {}
    });

    it("allows admin to unpause", async () => {
      const pauser = web3.Keypair.generate();
      const tx = await program.methods
        .addPauser(pauser.publicKey)
        .accounts({ payer: admin.publicKey, config: configPDA })
        .signers([admin])
        .rpc();
      await provider.connection.confirmTransaction(tx);

      const tx2 = await program.methods
        .pause()
        .accounts({ payer: pauser.publicKey, config: configPDA })
        .signers([pauser])
        .rpc();
      await provider.connection.confirmTransaction(tx2);
      const cfg = await program.account.config.fetch(configPDA);
      expect(cfg.paused == true);

      const tx3 = await program.methods
        .unpause()
        .accounts({ payer: admin.publicKey, config: configPDA })
        .signers([admin])
        .rpc();
      await provider.connection.confirmTransaction(tx3);
      const cfg2 = await program.account.config.fetch(configPDA);
      expect(cfg2.paused == false);
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
        "04ba5734d8f7091719471e7f7ed6b9df170dc70cc661ca05e688601ad984f068b0d67351e5f06073092499336ab0839ef8a521afd334e53807205fa2f08eec74f4",
        "hex"
      ),
      Buffer.from(
        "049d9031e97dd78ff8c15aa86939de9b1e791066a0224e331bc962a2099a7b1f0464b8bbafe1535f2301c72c2cb3535b172da30b02686ab0393d348614f157fbdb",
        "hex"
      ),
    ];
    const validators2 = [
      Buffer.from(
        "04ba5734d8f7091719471e7f7ed6b9df170dc70cc661ca05e688601ad984f068b0d67351e5f06073092499336ab0839ef8a521afd334e53807205fa2f08eec74f4",
        "hex"
      ),
      Buffer.from(
        "049d9031e97dd78ff8c15aa86939de9b1e791066a0224e331bc962a2099a7b1f0464b8bbafe1535f2301c72c2cb3535b172da30b02686ab0393d348614f157fbdb",
        "hex"
      ),
      Buffer.from(
        "0420b871f3ced029e14472ec4ebc3c0448164942b123aa6af91a3386c1c403e0ebd3b4a5752a2b6c49e574619e6aa0549eb9ccd036b9bbc507e1f7f9712a236092",
        "hex"
      ),
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
      ),
    ];
    const wrongSigs = [
      Buffer.from(
        "ad9cbefb2570d94d82095766a142e7f3eb115313f364db7c0fa01ac246aca5ff3654b5f6dbcdbfe086c86e5e7ae8e5178986944dafb077303a99e2bd75663c86",
        "hex"
      ),
      Buffer.from(
        "a474df436d805d9bce1ae640e7802c88e655496f008f428fd953f623a054d7782841f70a5c4ffa6da53ea661762967eb628b81ad6a8d6321f83fb66884855e3a",
        "hex"
      ),
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
          metadata: metadataPDA,
        })
        .signers([admin])
        .rpc();
      await provider.connection.confirmTransaction(tx);
    });

    it("should not allow someone else to add metadata other than creator", async () => {
      try {
        const tx2 = await program.methods
          .postMetadataForValsetPayload(
            Buffer.from(hash, "hex"),
            validators,
            weights
          )
          .accounts({
            payer: admin.publicKey,
            metadata: metadataPDA,
          })
          .signers([payer])
          .rpc();
        await provider.connection.confirmTransaction(tx2);
        assert.fail("should not be allowed");
      } catch (e) {}
    });

    it("should allow the creator to post metadata", async () => {
      const tx2 = await program.methods
        .postMetadataForValsetPayload(
          Buffer.from(hash, "hex"),
          validators,
          weights
        )
        .accounts({
          payer: admin.publicKey,
          metadata: metadataPDA,
        })
        .signers([admin])
        .rpc();
      await provider.connection.confirmTransaction(tx2);
    });

    it("should not allow another person to create validator set payload for someone's metadata", async () => {
      try {
        const tx3 = await program.methods
          .createValsetPayload(
            Buffer.from(hash, "hex"),
            new anchor.BN(1),
            new anchor.BN(1),
            new anchor.BN(1)
          )
          .accounts({
            payer: admin.publicKey,
            metadata: metadataPDA,
            payload: payloadPDA,
          })
          .signers([payer])
          .rpc();
        await provider.connection.confirmTransaction(tx3);
        assert.fail("should not be allowed");
      } catch (e) {}
    });

    it("should allow metadata creator to create a validator set payload", async () => {
      try {
        const tx3 = await program.methods
          .createValsetPayload(
            Buffer.from(hash, "hex"),
            new anchor.BN(1),
            new anchor.BN(1),
            new anchor.BN(1)
          )
          .accounts({
            payer: admin.publicKey,
            metadata: metadataPDA,
            payload: payloadPDA,
          })
          .signers([admin])
          .rpc();
        await provider.connection.confirmTransaction(tx3);
      } catch (e) {
        console.log(e);
        throw e;
      }
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
          metadata: metadataPDA2,
        })
        .signers([payer])
        .rpc();
      await provider.connection.confirmTransaction(tx);

      const tx2 = await program.methods
        .postMetadataForValsetPayload(
          Buffer.from(hash, "hex"),
          validators,
          weights
        )
        .accounts({
          payer: payer.publicKey,
          metadata: metadataPDA2,
        })
        .signers([payer])
        .rpc();
      await provider.connection.confirmTransaction(tx2);

      const tx3 = await program.methods
        .createValsetPayload(
          Buffer.from(hash, "hex"),
          new anchor.BN(1),
          new anchor.BN(1),
          new anchor.BN(1)
        )
        .accounts({
          payer: payer.publicKey,
          metadata: metadataPDA2,
          payload: payloadPDA2,
        })
        .signers([payer])
        .rpc();
      await provider.connection.confirmTransaction(tx3);

      try {
        const tx4 = await program.methods
          .setInitialValset(Buffer.from(hash, "hex"))
          .accounts({ payer: payer.publicKey, config: configPDA })
          .signers([payer])
          .rpc();
        await provider.connection.confirmTransaction(tx4);
        assert.fail("should not be allowed");
      } catch (e) {}
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
          metadata: metadataPDA2,
        })
        .signers([admin])
        .rpc();
      await provider.connection.confirmTransaction(tx);

      const tx2 = await program.methods
        .postMetadataForValsetPayload(
          Buffer.from(hash2, "hex"),
          validators2,
          weights2
        )
        .accounts({
          payer: admin.publicKey,
          metadata: metadataPDA2,
        })
        .signers([admin])
        .rpc();
      await provider.connection.confirmTransaction(tx2);

      const tx3 = await program.methods
        .createValsetPayload(
          Buffer.from(hash2, "hex"),
          new anchor.BN(2),
          new anchor.BN(2),
          new anchor.BN(1)
        )
        .accounts({
          payer: admin.publicKey,
          metadata: metadataPDA2,
          payload: payloadPDA2,
        })
        .signers([admin])
        .rpc();
      await provider.connection.confirmTransaction(tx3);

      try {
        const tx4 = await program.methods
          .setInitialValset(Buffer.from(hash2, "hex"))
          .accounts({ payer: admin.publicKey, config: configPDA })
          .signers([admin])
          .rpc();
        await provider.connection.confirmTransaction(tx4);
        assert.fail("should not be allowed");
      } catch (e) {}
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
          metadata: metadataPDA2,
        })
        .signers([payer])
        .rpc();
      await provider.connection.confirmTransaction(tx);

      const tx2 = await program.methods
        .postMetadataForValsetPayload(
          Buffer.from(hash2, "hex"),
          validators2,
          weights2
        )
        .accounts({
          payer: payer.publicKey,
          metadata: metadataPDA2,
        })
        .signers([payer])
        .rpc();
      await provider.connection.confirmTransaction(tx2);

      const tx3 = await program.methods
        .createValsetPayload(
          Buffer.from(hash2, "hex"),
          new anchor.BN(2),
          new anchor.BN(2),
          new anchor.BN(1)
        )
        .accounts({
          payer: payer.publicKey,
          metadata: metadataPDA2,
          payload: payloadPDA2,
        })
        .signers([payer])
        .rpc();
      await provider.connection.confirmTransaction(tx3);

      try {
        const tx4 = await program.methods
          .setNextValset(Buffer.from(hash2, "hex"))
          .accounts({
            payer: payer.publicKey,
            config: configPDA,
            metadata: metadataPDA2,
            payload: payloadPDA2,
          })
          .signers([payer])
          .rpc();
        await provider.connection.confirmTransaction(tx4);
        assert.fail("should not be allowed");
      } catch (e) {}
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
      assert.equal(payload.signatures.length, 0);

      const tx = await program.methods
        .postValsetSignatures(Buffer.from(hash2, "hex"), wrongSigs, [
          new anchor.BN(0),
          new anchor.BN(1),
        ])
        .accounts({
          payer: payer.publicKey,
          config: configPDA,
          payload: payloadPDA2,
        })
        .signers([payer])
        .rpc();
      await provider.connection.confirmTransaction(tx);

      const payload2 = await program.account.valsetPayload.fetch(payloadPDA2);
      assert.equal(payload2.signatures.length, 0);
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
      assert.equal(payload.signatures.length, 0);

      const tx = await program.methods
        .postValsetSignatures(Buffer.from(hash2, "hex"), sigs, [
          new anchor.BN(0),
          new anchor.BN(1),
        ])
        .accounts({
          payer: payer.publicKey,
          config: configPDA,
          payload: payloadPDA2,
        })
        .signers([payer])
        .rpc();
      await provider.connection.confirmTransaction(tx);

      const payload2 = await program.account.valsetPayload.fetch(payloadPDA2);
      assert.equal(payload2.signatures.length, 2);

      const tx4 = await program.methods
        .setNextValset(Buffer.from(hash2, "hex"))
        .accounts({
          payer: payer.publicKey,
          config: configPDA,
          metadata: metadataPDA2,
          payload: payloadPDA2,
        })
        .signers([payer])
        .rpc();
      await provider.connection.confirmTransaction(tx4);
    });
  });

  describe("Minting and redeeming", () => {
    let userTA;
    let minterTA;
    const minter = web3.Keypair.generate();

    const scriptPubkey = [
      0, 20, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2,
    ];

    const feePayload = Buffer.from(
      "f2e73f7c0259db5080fc2c6d3bcf7ca90712d3c2e5e6c28f27f0dfbb9953bdb0894c03abd55cad4b145c9fa6f0c634827d2d3a889bcd4e6e6a9527a89b2f8259bfcbc8f8000000000000000000000000000000000000000000000000000000000000271000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000",
      "hex"
    );
    const feeHash = sha256(feePayload);

    // Index 0 and 2
    const feeSigs = [
      Buffer.from(
        "b70c5823843bc2ad3b86ea83c1b8a0972ee21ecd81f54f88c35da9a4c3d881927b377d38800a37213b0c919a54d576ebfa0579d7bc3b1b94474133ba3c4465c0",
        "hex"
      ),
      Buffer.from(
        "0f2a4435f4ca1773c16c84ad6ed209eb806cd1ea052d42eac6cb47a9fcf699d802a47e8d288e9d0eddb95f83ccd74062871d9f8d7faf4ee23fda80bc839dd5fc",
        "hex"
      ),
    ];

    const feePayloadPDA = web3.PublicKey.findProgramAddressSync(
      [Buffer.from(feeHash, "hex")],
      program.programId
    )[0];

    before(async () => {
      userTA = await spl.createAssociatedTokenAccount(
        provider.connection,
        user,
        mint,
        user.publicKey
      );

      await fundWallet(minter, 25 * web3.LAMPORTS_PER_SOL);
      const tx = await program.methods
        .addMinter(minter.publicKey)
        .accounts({ payer: admin.publicKey, config: configPDA })
        .signers([admin])
        .rpc();
      await provider.connection.confirmTransaction(tx);

      minterTA = await spl.createAssociatedTokenAccount(
        provider.connection,
        minter,
        mint,
        minter.publicKey
      );
    });

    it("should not allow non-minter to mint", async () => {
      try {
        const tx = await program.methods
          .mint(new anchor.BN(1000))
          .accounts({
            payer: user.publicKey,
            config: configPDA,
            recipient: userTA,
            mint: mint,
            tokenAuthority: tokenAuth,
            tokenProgram: spl.TOKEN_PROGRAM_ID,
          })
          .signers([user])
          .rpc();
        await provider.connection.confirmTransaction(tx);
        assert.fail("should not be allowed");
      } catch (e) {}
    });

    it("should allow minter to mint freely", async () => {
      const tx = await program.methods
        .mint(new anchor.BN(1000))
        .accounts({
          payer: minter.publicKey,
          config: configPDA,
          recipient: userTA,
          mint: mint,
          tokenAuthority: tokenAuth,
          tokenProgram: spl.TOKEN_PROGRAM_ID,
        })
        .signers([minter])
        .rpc();
      await provider.connection.confirmTransaction(tx);
    });

    it("should not allow non-minter to burn", async () => {
      try {
        const tx = await program.methods
          .burn(new anchor.BN(1000))
          .accounts({
            payer: user.publicKey,
            config: configPDA,
            recipient: userTA,
            mint: mint,
            tokenProgram: spl.TOKEN_PROGRAM_ID,
          })
          .signers([user])
          .rpc();
        await provider.connection.confirmTransaction(tx);
        assert.fail("should not be allowed");
      } catch (e) {}
    });

    // NOTE: minters can only burn from their own wallets.
    it("should allow minter to burn freely", async () => {
      const tx = await program.methods
        .mint(new anchor.BN(1000))
        .accounts({
          payer: minter.publicKey,
          config: configPDA,
          recipient: minterTA,
          mint: mint,
          tokenAuthority: tokenAuth,
          tokenProgram: spl.TOKEN_PROGRAM_ID,
        })
        .signers([minter])
        .rpc();
      await provider.connection.confirmTransaction(tx);

      const tx2 = await program.methods
        .burn(new anchor.BN(1000))
        .accounts({
          payer: minter.publicKey,
          config: configPDA,
          recipient: minterTA,
          mint: mint,
          tokenProgram: spl.TOKEN_PROGRAM_ID,
        })
        .signers([minter])
        .rpc();
      await provider.connection.confirmTransaction(tx2);
    });

    it("should allow anyone to create mint payload", async () => {
      const tx = await program.methods
        .createMintPayload(Buffer.from(feeHash, "hex"), feePayload)
        .accounts({
          payer: payer.publicKey,
          config: configPDA,
          payload: feePayloadPDA,
        })
        .signers([payer])
        .rpc();
      await provider.connection.confirmTransaction(tx);
    });

    it("should not allow to mint without proper signatures", async () => {
      try {
        const tx = await program.methods
          .mintFromPayload(Buffer.from(feeHash, "hex"))
          .accounts({
            config: configPDA,
            tokenProgram: spl.TOKEN_PROGRAM_ID,
            recipient: recipientTA,
            mint: mint,
            tokenAuthority: tokenAuth,
            payload: feePayloadPDA,
            bascule: payer.publicKey,
          })
          .signers([payer])
          .rpc();
        await provider.connection.confirmTransaction(tx);
        assert.fail("should not work");
      } catch (e) {}
    });

    it("should allow anyone to post signatures for mint payload", async () => {
      const tx = await program.methods
        .postMintSignatures(Buffer.from(feeHash, "hex"), feeSigs, [
          new anchor.BN(0),
          new anchor.BN(2),
        ])
        .accounts({ config: configPDA, payload: feePayloadPDA })
        .rpc();
      await provider.connection.confirmTransaction(tx);
    });

    it("should allow to mint with proper signatures", async () => {
      const tx = await program.methods
        .mintFromPayload(Buffer.from(feeHash, "hex"))
        .accounts({
          config: configPDA,
          tokenProgram: spl.TOKEN_PROGRAM_ID,
          recipient: recipientTA,
          mint: mint,
          tokenAuthority: tokenAuth,
          payload: feePayloadPDA,
          bascule: payer.publicKey,
        })
        .rpc();
      await provider.connection.confirmTransaction(tx);
    });

    it("should not allow non-claimer to mint with fee", async () => {});

    it("should allow claimer to mint with fee to wrong treasury", async () => {});

    it("should allow claimer to mint with fee", async () => {});

    it("should not allow user to redeem if they don't have enough LBTC", async () => {
      try {
        const tx = await program.methods
          .redeem(Buffer.from(scriptPubkey), new anchor.BN(2000))
          .accounts({
            payer: user.publicKey,
            holder: userTA,
            config: configPDA,
            tokenProgram: spl.TOKEN_PROGRAM_ID,
            mint: mint,
            treasury: treasury,
          })
          .signers([user])
          .rpc();
        await provider.connection.confirmTransaction(tx);
        assert.fail("should not work");
      } catch (e) {}
    });

    it("should not allow user to redeem below burn commission", async () => {
      try {
        // 10 burn commission
        const tx = await program.methods
          .redeem(Buffer.from(scriptPubkey), new anchor.BN(10))
          .accounts({
            payer: user.publicKey,
            holder: userTA,
            config: configPDA,
            tokenProgram: spl.TOKEN_PROGRAM_ID,
            mint: mint,
            treasury: treasury,
          })
          .signers([user])
          .rpc();
        await provider.connection.confirmTransaction(tx);
        assert.fail("should not work");
      } catch (e) {}
    });

    it("should not allow user to redeem below dust limit", async () => {
      try {
        // 10 burn commission + 294 dust limit
        const tx = await program.methods
          .redeem(Buffer.from(scriptPubkey), new anchor.BN(304))
          .accounts({
            payer: user.publicKey,
            holder: userTA,
            config: configPDA,
            tokenProgram: spl.TOKEN_PROGRAM_ID,
            mint: mint,
            treasury: treasury,
          })
          .signers([user])
          .rpc();
        await provider.connection.confirmTransaction(tx);
        assert.fail("should not work");
      } catch (e) {}
    });

    it("should not allow user to redeem to invalid script pubkey", async () => {
      try {
        const tx = await program.methods
          .redeem(Buffer.from([0, 1, 2]), new anchor.BN(1000))
          .accounts({
            payer: user.publicKey,
            holder: userTA,
            config: configPDA,
            tokenProgram: spl.TOKEN_PROGRAM_ID,
            mint: mint,
            treasury: treasury,
          })
          .signers([user])
          .rpc();
        await provider.connection.confirmTransaction(tx);
        assert.fail("should not work");
      } catch (e) {}
    });

    it("should not allow user to redeem when withdrawals are disabled", async () => {
      const tx = await program.methods
        .toggleWithdrawals()
        .accounts({ payer: admin.publicKey, config: configPDA })
        .signers([admin])
        .rpc();
      await provider.connection.confirmTransaction(tx);

      try {
        const tx2 = await program.methods
          .redeem(Buffer.from(scriptPubkey), new anchor.BN(1000))
          .accounts({
            payer: user.publicKey,
            holder: userTA,
            config: configPDA,
            tokenProgram: spl.TOKEN_PROGRAM_ID,
            mint: mint,
            treasury: treasury,
          })
          .signers([user])
          .rpc();
        await provider.connection.confirmTransaction(tx2);
        assert.fail("should not work");
      } catch (e) {}

      const tx3 = await program.methods
        .toggleWithdrawals()
        .accounts({ payer: admin.publicKey, config: configPDA })
        .signers([admin])
        .rpc();
      await provider.connection.confirmTransaction(tx3);
    });

    it("should not allow user to redeem with improper treasury", async () => {
      try {
        const tx = await program.methods
          .redeem(Buffer.from(scriptPubkey), new anchor.BN(1000))
          .accounts({
            payer: user.publicKey,
            holder: userTA,
            config: configPDA,
            tokenProgram: spl.TOKEN_PROGRAM_ID,
            mint: mint,
            treasury: userTA,
          })
          .signers([user])
          .rpc();
        await provider.connection.confirmTransaction(tx);
        assert.fail("should not work");
      } catch (e) {}
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
          treasury: treasury,
        })
        .signers([user])
        .rpc();
      await provider.connection.confirmTransaction(tx);
    });
  });
});
