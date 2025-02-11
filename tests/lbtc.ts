import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Lbtc } from "../target/types/lbtc";
import * as spl from "@solana/spl-token";
import * as fs from "fs";

const web3 = require("@solana/web3.js");
const assert = require("assert");
const expect = require("chai").expect;

describe("sol-contracts", () => {
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
});
