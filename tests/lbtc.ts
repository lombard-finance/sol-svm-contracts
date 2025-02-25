import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Lbtc } from "../target/types/lbtc";
import * as spl from "@solana/spl-token";
import * as fs from "fs";
import { sha256 } from "js-sha256";

const web3 = require("@solana/web3.js");
const assert = require("assert");
const expect = require("chai").expect;

describe("LBTC", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.Lbtc as Program<Lbtc>;

  let payer;
  let admin;
  let operator;
  let configPDA;
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
    admin = web3.Keypair.generate();
    operator = web3.Keypair.generate();

  before(async () => {
    await fundWallet(payer, 25 * web3.LAMPORTS_PER_SOL);
    await fundWallet(admin, 25 * web3.LAMPORTS_PER_SOL);
    await fundWallet(operator, 25 * web3.LAMPORTS_PER_SOL);

    [configPDA] = web3.PublicKey.findProgramAddressSync(
      [Buffer.from("lbtc_config")],
      program.programId
    );

    await fundWallet(configPDA, 1 * web3.LAMPORTS_PER_SOL);
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
      const dustFeeRate = new anchor.BN(2000);
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
        const dustFeeRate = new anchor.BN(2000);
        const tx = await program.methods
          .setDustFeeRate(dustFeeRate)
          .accounts({ payer: payer.publicKey, config: configPDA })
          .signers([payer])
          .rpc();
        assert.fail("should not be allowed");
      } catch (e) {}
    });

    it("allows admin to set treasury", async () => {
      const treasury = web3.Keypair.generate();
      const tx = await program.methods
        .setTreasury(treasury.publicKey)
        .accounts({ payer: admin.publicKey, config: configPDA })
        .signers([admin])
        .rpc();
      await provider.connection.confirmTransaction(tx);
      const cfg = await program.account.config.fetch(configPDA);
      expect(cfg.treasury.toBase58() == treasury.publicKey.toBase58());
    });

    it("should not allow anyone else to set treasury", async () => {
      try {
        const treasury = web3.Keypair.generate();
        const tx = await program.methods
          .setTreasury(treasury.publicKey)
          .accounts({ payer: payer.publicKey, config: configPDA })
          .signers([payer])
          .rpc();
        assert.fail("should not be allowed");
      } catch (e) {}
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
      "4aab1d6f000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000a00000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000004000000000000000000000000000000000000000000000000000000000000000c0000000000000000000000000000000000000000000000000000000000000004104ba5734d8f7091719471e7f7ed6b9df170dc70cc661ca05e688601ad984f068b0d67351e5f06073092499336ab0839ef8a521afd334e53807205fa2f08eec74f4000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000041049d9031e97dd78ff8c15aa86939de9b1e791066a0224e331bc962a2099a7b1f0464b8bbafe1535f2301c72c2cb3535b172da30b02686ab0393d348614f157fbdb00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000001",
      "hex"
    );
    const signatures = Buffer.from(
      "00000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000003000000000000000000000000000000000000000000000000000000000000006000000000000000000000000000000000000000000000000000000000000000c000000000000000000000000000000000000000000000000000000000000001200000000000000000000000000000000000000000000000000000000000000040976b76d08d5628efe8e7ba998dc76e432769ea735a861e14f5c25873f76255a53efa7a5ce215f48c2278c1e15c5d5a95eeee47b417a995a68f964eb4ba0416cf00000000000000000000000000000000000000000000000000000000000000405170e1e8004c677fbd7a712065073bfff46b5752e8020a2b098b2bd6d30fde0a65a8044a79c2c730483de1e26ae48570cae11a335547e167ecf5d07fa7aa45fe0000000000000000000000000000000000000000000000000000000000000000",
      "hex"
    );

    const hash = sha256(initialValset);
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
    const weights = [new anchor.BN(1), new anchor.BN(1)];

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
          .accounts({ payer: payer.publicKey, config: configPDA2 })
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

    it("should not allow setting initial valset twice", async () => {});

    it("should not allow setting next valset without proper signatures", async () => {});

    it("should not allow adding wrong signatures", async () => {});

    it("should allow to set next valset with proper signatures", async () => {});
  });

  describe("Minting and redeeming", () => {
    it("should not allow non-minter to mint", async () => {});

    it("should allow minter to mint freely", async () => {});

    it("should not allow non-minter to burn", async () => {});

    it("should allow minter to burn freely", async () => {});
    
    it("should allow anyone to create mint payload", async () => {});

    it("should not allow to mint without proper signatures", async () => {});

    it("should allow anyone to post signatures for mint payload", async () => {});

    it("should allow to mint with proper signatures", async () => {});

    it("should not allow non-claimer to mint with fee", async () => {});

    it("should allow claimer to mint with fee to wrong treasury", async () => {});

    it("should allow claimer to mint with fee", async () => {});

    it("should not allow user to redeem if they don't have enough LBTC", async () => {});

    it("should not allow user to redeem below burn commission", async () => {});

    it("should not allow user to redeem below dust limit", async () => {});

    it("should not allow user to redeem to invalid script pubkey", async () => {});

    it("should not allow user to redeem when withdrawals are disabled", async () => {});

    it("should not allow user to redeem with improper treasury", async () => {});

    it("should allow user to redeem", async () => {});
  });
});
