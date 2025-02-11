import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Lbtc } from "../target/types/lbtc";
import * as spl from "@solana/spl-token";
import * as fs from "fs";

const web3 = require("@solana/web3.js");

describe("sol-contracts", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.Lbtc as Program<Lbtc>;

  let payer;
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

    await fundWallet(payer, 25 * web3.LAMPORTS_PER_SOL);

    [configPDA] = web3.PublicKey.findProgramAddressSync(
      [Buffer.from("lbtc_config")],
      program.programId
    );

    await fundWallet(configPDA, 1 * web3.LAMPORTS_PER_SOL);
  });

  it("is initialized", async () => {
    const tx = await program.methods
      .initialize()
      .accounts({
        payer: payer.publicKey,
        config: configPDA,
        systemProgram: web3.SystemProgram.programId,
      })
      .signers([payer])
      .rpc();
      await provider.connection.confirmTransaction(tx);
  });

  it("allows admin to toggle withdrawals", async () => {});

  it("should not allow anyone else to toggle withdrawals", async () => {});
});
