import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Lbtc } from "../target/types/lbtc";
import * as spl from "@solana/spl-token";
import * as fs from "fs";

const web3 = require("@solana/web3.js");
const assert = require("assert");
const expect = require("chai").expect;

describe("LBTC setters and getters", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.Lbtc as Program<Lbtc>;

  let payer;
  let admin;
  let operator;
  let configPDA;

  // Utility function for airdrops
  async function fundWallet(account, amount) {
    const publicKey = account.publicKey ? account.publicKey : account;

    await provider.connection.confirmTransaction(
      await provider.connection.requestAirdrop(publicKey, amount),
      "confirmed"
    );
  }

  before(async () => {
    payer = web3.Keypair.generate();
    admin = web3.Keypair.generate();
    operator = web3.Keypair.generate();

    await fundWallet(payer, 25 * web3.LAMPORTS_PER_SOL);
    await fundWallet(admin, 25 * web3.LAMPORTS_PER_SOL);
    await fundWallet(operator, 25 * web3.LAMPORTS_PER_SOL);

    [configPDA] = web3.PublicKey.findProgramAddressSync(
      [Buffer.from("lbtc_config")],
      program.programId
    );

    await fundWallet(configPDA, 1 * web3.LAMPORTS_PER_SOL);
  });

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
    } catch (e) {}
  });

  it("allows admin to set bascule", async () => {
    const bascule = web3.Keypair.generate();
    const tx = await program.methods
      .setBascule(bascule.publicKey)
      .accounts({ payer: admin.publicKey, config: configPDA })
      .signers([admin])
      .rpc();
    await provider.connection.confirmTransaction(tx);
    const cfg = await program.account.config.fetch(configPDA);
    expect(cfg.bascule.toBase58() == bascule.publicKey.toBase58());
  });

  it("should not allow anyone else to set operator", async () => {
    try {
      const bascule = web3.Keypair.generate();
      const tx = await program.methods
        .setBascule(bascule.publicKey)
        .accounts({ payer: payer.publicKey, config: configPDA })
        .signers([payer])
        .rpc();
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
    } catch (e) {}
  });

  it("allows admin to set chain id", async () => {
    const chainId = [
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0,
    ];
    const tx = await program.methods
      .setChainId(chainId)
      .accounts({ payer: admin.publicKey, config: configPDA })
      .signers([admin])
      .rpc();
    await provider.connection.confirmTransaction(tx);
    const cfg = await program.account.config.fetch(configPDA);
    expect(cfg.chainId == chainId);
  });

  it("should not allow anyone else to set chain id", async () => {
    try {
      const chainId = [
        0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
        0, 0, 0, 0, 0, 0, 0, 0, 0,
      ];
      const tx = await program.methods
        .setChainId(chainId)
        .accounts({ payer: payer.publicKey, config: configPDA })
        .signers([payer])
        .rpc();
    } catch (e) {}
  });

  it("allows admin to set deposit btc action", async () => {
    const action = 30;
    const tx = await program.methods
      .setDepositBtcAction(action)
      .accounts({ payer: admin.publicKey, config: configPDA })
      .signers([admin])
      .rpc();
    await provider.connection.confirmTransaction(tx);
    const cfg = await program.account.config.fetch(configPDA);
    expect(cfg.depositBtcAction == action);
  });

  it("should not allow anyone else to set deposit btc action", async () => {
    try {
    const action = 30;
      const tx = await program.methods
        .setDepositBtcAction(action)
        .accounts({ payer: payer.publicKey, config: configPDA })
        .signers([payer])
        .rpc();
    } catch (e) {}
  });

  it("allows admin to set valset action", async () => {
    const action = 30;
    const tx = await program.methods
      .setValsetAction(action)
      .accounts({ payer: admin.publicKey, config: configPDA })
      .signers([admin])
      .rpc();
    await provider.connection.confirmTransaction(tx);
    const cfg = await program.account.config.fetch(configPDA);
    expect(cfg.setValsetAction == action);
  });

  it("should not allow anyone else to set valset action", async () => {
    try {
    const action = 30;
      const tx = await program.methods
        .setValsetAction(action)
        .accounts({ payer: payer.publicKey, config: configPDA })
        .signers([payer])
        .rpc();
    } catch (e) {}
  });

  it("allows admin to set fee action", async () => {
    const action = 30;
    const tx = await program.methods
      .setFeeApprovalAction(action)
      .accounts({ payer: admin.publicKey, config: configPDA })
      .signers([admin])
      .rpc();
    await provider.connection.confirmTransaction(tx);
    const cfg = await program.account.config.fetch(configPDA);
    expect(cfg.feeApprovalAction == action);
  });

  it("should not allow anyone else to set fee action", async () => {
    try {
    const action = 30;
      const tx = await program.methods
        .setFeeApprovalAction(action)
        .accounts({ payer: payer.publicKey, config: configPDA })
        .signers([payer])
        .rpc();
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

    const tx2 = await program.methods.pause().accounts({ payer: pauser.publicKey, config: configPDA }).signers([pauser]).rpc();
    await provider.connection.confirmTransaction(tx2);
    const cfg = await program.account.config.fetch(configPDA);
    expect(cfg.paused == true);
  });

  it("should not allow anyone else to pause", async () => {
    try {
      const tx = await program.methods
        .pause()
        .accounts({ payer: payer.publicKey, config: configPDA })
        .signers([payer])
        .rpc();
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

    const tx2 = await program.methods.pause().accounts({ payer: pauser.publicKey, config: configPDA }).signers([pauser]).rpc();
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

  it("should not allow anyone else to unpause", async () => {
    const pauser = web3.Keypair.generate();
    const tx = await program.methods
      .addPauser(pauser.publicKey)
      .accounts({ payer: admin.publicKey, config: configPDA })
      .signers([admin])
      .rpc();
    await provider.connection.confirmTransaction(tx);

    const tx2 = await program.methods.pause().accounts({ payer: pauser.publicKey, config: configPDA }).signers([pauser]).rpc();
    await provider.connection.confirmTransaction(tx2);
    const cfg = await program.account.config.fetch(configPDA);
    expect(cfg.paused == true);
    try {
      const tx3 = await program.methods
        .unpause()
        .accounts({ payer: payer.publicKey, config: configPDA })
        .signers([payer])
        .rpc();
    } catch (e) {}
  });
});

describe('Consortium actions', () => {

});

describe('Minting and redeeming', () => {

});
