import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { PublicKey, Keypair, SystemProgram, LAMPORTS_PER_SOL } from "@solana/web3.js";
import * as spl from "@solana/spl-token";
import { Lbtc } from "../target/types/lbtc";
import { sha256 } from "js-sha256";
import bs58 from "bs58";
import nacl from "tweetnacl";
import chai from "chai";
import chaiAsPromised from "chai-as-promised";

chai.use(chaiAsPromised);
const expect = chai.expect;

BN.prototype.bigInt = function (): bigint {
  return BigInt(this.toString(10));
};

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

  recipientPubKey(): PublicKey {
    let address = bs58.encode(Buffer.from(this.destinationAddress, "hex"));
    return new PublicKey(address);
  }

  amountBigInt(): bigint {
    return BigInt("0x" + this.amount);
  }
}

class FeePermit {
  prefix: string;
  chainId: string;
  programId: string;
  maxFees: string;
  expire: string;

  constructor(programId: string, maxFees: number) {
    this.prefix = "04acbbb2";
    this.chainId = "0259db5080fc2c6d3bcf7ca90712d3c2e5e6c28f27f0dfbb9953bdb0894c03ab";
    this.programId = programId;
    this.maxFees = maxFees.toString(16).padStart(64, "0");
    // Hardcode end of unix epoch so tests always pass
    this.expire = "00000000000000000000000000000000000000000000000000000000ffffffff";
  }

  hex(): string {
    return this.prefix + this.chainId + this.programId + this.maxFees + this.expire;
  }

  bytes(): Buffer {
    return Buffer.from(this.hex(), "hex");
  }

  signature(secretKey: Uint8Array): Buffer {
    return Buffer.from(nacl.sign.detached(this.bytes(), secretKey));
  }

  maxFeesBigInt(): bigint {
    return BigInt("0x" + this.maxFees);
  }
}

describe("LBTC", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.Lbtc as Program<Lbtc>;

  let payer: Keypair;
  let user: Keypair;
  let admin: Keypair;
  let operator: Keypair;
  let pauser: Keypair;
  let minter: Keypair;
  let claimer: Keypair;
  let configPDA: PublicKey;
  let treasury: PublicKey;
  const mintKeys = Keypair.fromSeed(Uint8Array.from(Array(32).fill(5)));
  let mint: PublicKey;
  let recipient: Keypair;
  let recipientTA: PublicKey;
  const tokenAuth = PublicKey.findProgramAddressSync(
    [Buffer.from("token_authority")],
    program.programId
  )[0] as PublicKey;
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

  payer = Keypair.generate();
  user = Keypair.generate();
  admin = Keypair.generate();
  operator = Keypair.generate();
  pauser = Keypair.generate();
  minter = Keypair.generate();
  claimer = Keypair.generate();
  const t = Keypair.generate();
  recipient = Keypair.fromSeed(Uint8Array.from(Array(32).fill(4)));

  before(async () => {
    await fundWallet(payer, 25 * LAMPORTS_PER_SOL);
    await fundWallet(user, 25 * LAMPORTS_PER_SOL);
    await fundWallet(admin, 25 * LAMPORTS_PER_SOL);
    await fundWallet(operator, 25 * LAMPORTS_PER_SOL);
    await fundWallet(pauser, 25 * LAMPORTS_PER_SOL);
    await fundWallet(minter, 25 * LAMPORTS_PER_SOL);
    await fundWallet(claimer, 25 * LAMPORTS_PER_SOL);

    await fundWallet(t, 25 * LAMPORTS_PER_SOL);
    await fundWallet(recipient, 25 * LAMPORTS_PER_SOL);

    mint = await spl.createMint(provider.connection, admin, tokenAuth, null, 8, mintKeys);

    [configPDA] = PublicKey.findProgramAddressSync([Buffer.from("lbtc_config")], program.programId);

    treasury = await spl.createAssociatedTokenAccount(provider.connection, t, mint, t.publicKey);

    recipientTA = await spl.createAssociatedTokenAccount(provider.connection, recipient, mint, recipient.publicKey);
  });

  describe("Initialize and set roles", function () {
    it("initialize: fails when payer is not deployer", async () => {
      const burnCommission = new BN(1);
      const dustFeeRate = new BN(1000);
      const mintFee = new BN(1);
      const programData = PublicKey.findProgramAddressSync(
        [program.programId.toBuffer()],
        new PublicKey("BPFLoaderUpgradeab1e11111111111111111111111")
      )[0];
      await expect(
        program.methods
          .initialize(admin.publicKey, burnCommission, dustFeeRate, mintFee)
          .accounts({
            deployer: payer.publicKey,
            programData,
            mint,
            treasury,
            config: configPDA,
            systemProgram: SystemProgram.programId
          })
          .signers([payer])
          .rpc()
      ).to.be.rejectedWith("A raw constraint was violated.");
    });

    it("initialize: successful", async () => {
      const burnCommission = new BN(1);
      const dustFeeRate = new BN(1000);
      const mintFee = new BN(1);
      const programData = PublicKey.findProgramAddressSync(
        [program.programId.toBuffer()],
        new PublicKey("BPFLoaderUpgradeab1e11111111111111111111111")
      )[0];
      const tx = await program.methods
        .initialize(admin.publicKey, burnCommission, dustFeeRate, mintFee)
        .accounts({
          deployer: provider.wallet.publicKey,
          programData,
          mint,
          treasury,
          config: configPDA,
          systemProgram: SystemProgram.programId
        })
        .signers([Keypair.fromSecretKey(provider.wallet.payer.secretKey)])
        .rpc();
      await provider.connection.confirmTransaction(tx);
      const cfg = await program.account.config.fetch(configPDA);
      expect(cfg.admin.toBase58()).to.be.eq(admin.publicKey.toBase58());
    });

    //Operator is a role which can set mint fee for autoclaim
    it("setOperator: successful by admin", async () => {
      const tx = await program.methods
        .setOperator(operator.publicKey)
        .accounts({ payer: admin.publicKey, config: configPDA })
        .signers([admin])
        .rpc();
      await provider.connection.confirmTransaction(tx);
      const cfg = await program.account.config.fetch(configPDA);
      expect(cfg.operator.toBase58() == operator.publicKey.toBase58());
    });

    //Treasury is an account that collects fees for autoclaim and redeem
    it("setTreasury: successful by admin", async () => {
      const tx = await program.methods
        .setTreasury()
        .accounts({ payer: admin.publicKey, config: configPDA, treasury })
        .signers([admin])
        .rpc();
      await provider.connection.confirmTransaction(tx);
      const cfg = await program.account.config.fetch(configPDA);
      expect(cfg.treasury.toBase58() == treasury.toBase58());
    });

    it("setBascule: successful by admin", async () => {
      const tx = await program.methods
        .setBascule(payer.publicKey)
        .accounts({ payer: admin.publicKey, config: configPDA })
        .signers([admin])
        .rpc();
      await provider.connection.confirmTransaction(tx);
      const cfg = await program.account.config.fetch(configPDA);
      expect(cfg.bascule.toBase58() == payer.publicKey.toBase58());
    });

    //Claimer is a role which can perform autoclaim
    it("addClaimer: successful by admin", async () => {
      const tx = await program.methods
        .addClaimer(claimer.publicKey)
        .accounts({ payer: admin.publicKey, config: configPDA })
        .signers([admin])
        .rpc();
      await provider.connection.confirmTransaction(tx);
      const cfg = await program.account.config.fetch(configPDA);
      expect(cfg.claimers[0].toBase58() == claimer.publicKey.toBase58());
    });

    //Claimer is a role which can perform autoclaim
    it("addClaimer: adding twice should not increase claimers", async () => {
      await expect(
        program.methods
          .addClaimer(claimer.publicKey)
          .accounts({ payer: admin.publicKey, config: configPDA })
          .signers([admin])
          .rpc()
      ).to.be.rejectedWith("ClaimerExists");
    });

    //Pauser is a role that can only set contracts on pause
    it("addPauser: successful by admin", async () => {
      const tx = await program.methods
        .addPauser(pauser.publicKey)
        .accounts({ payer: admin.publicKey, config: configPDA })
        .signers([admin])
        .rpc();
      await provider.connection.confirmTransaction(tx);
      const cfg = await program.account.config.fetch(configPDA);
      expect(cfg.pausers[0].toBase58() == pauser.publicKey.toBase58());
    });

    //Pauser is a role that can only set contracts on pause
    it("addPauser: adding twice should not increase pausers", async () => {
      await expect(
        program.methods
          .addPauser(pauser.publicKey)
          .accounts({ payer: admin.publicKey, config: configPDA })
          .signers([admin])
          .rpc()
      ).to.be.rejectedWith("PauserExists");
    });

    //MintFee is a fee that charged for autoclaim and transfered to treasury
    it("setMintFee: successful by operator", async () => {
      const mintFee = new BN(10);
      const tx2 = await program.methods
        .setMintFee(mintFee)
        .accounts({ payer: operator.publicKey, config: configPDA })
        .signers([operator])
        .rpc();
      await provider.connection.confirmTransaction(tx2);
      let cfg = await program.account.config.fetch(configPDA);
      expect(cfg.mintFee.bigInt()).to.be.eq(mintFee.bigInt());
    });

    //BurnCommission is a fee that charged at redeem
    it("setBurnCommission: successful by admin", async () => {
      const burnCommission = new BN(10);
      const tx = await program.methods
        .setBurnCommission(burnCommission)
        .accounts({ payer: admin.publicKey, config: configPDA })
        .signers([admin])
        .rpc();
      await provider.connection.confirmTransaction(tx);
      const cfg = await program.account.config.fetch(configPDA);
      expect(cfg.burnCommission.eq(burnCommission));
    });

    it("setDustFeeRate: successful by admin", async () => {
      const dustFeeRate = new BN(3000);
      const tx = await program.methods
        .setDustFeeRate(dustFeeRate)
        .accounts({ payer: admin.publicKey, config: configPDA })
        .signers([admin])
        .rpc();
      await provider.connection.confirmTransaction(tx);
      const cfg = await program.account.config.fetch(configPDA);
      expect(cfg.dustFeeRate.eq(dustFeeRate));
    });

    it("transferOwnership: failure from unauthorized party", async () => {
      await expect(
        program.methods
          .transferOwnership(payer.publicKey)
          .accounts({ payer: payer.publicKey, config: configPDA })
          .signers([payer])
          .rpc()
      ).to.be.rejectedWith("An address constraint was violated");
    });

    it("transferOwnership: successful by admin", async () => {
      const tx = await program.methods
        .transferOwnership(payer.publicKey)
        .accounts({ payer: admin.publicKey, config: configPDA })
        .signers([admin])
        .rpc();
      await provider.connection.confirmTransaction(tx);
      const cfg = await program.account.config.fetch(configPDA);
      expect(cfg.admin.toBase58()).to.be.equal(admin.publicKey.toBase58());
      expect(cfg.pendingAdmin.toBase58()).to.be.equal(payer.publicKey.toBase58());
    });

    it("acceptOwnership: failure from unauthorized party", async () => {
      await expect(
        program.methods.acceptOwnership().accounts({ payer: user.publicKey, config: configPDA }).signers([user]).rpc()
      ).to.be.rejectedWith("An address constraint was violated");
    });

    it("acceptOwnership: successful by pending admin", async () => {
      const tx = await program.methods
        .acceptOwnership()
        .accounts({ payer: payer.publicKey, config: configPDA })
        .signers([payer])
        .rpc();
      await provider.connection.confirmTransaction(tx);
      const cfg = await program.account.config.fetch(configPDA);
      expect(cfg.admin.toBase58()).to.be.equal(payer.publicKey.toBase58());

      // Reverse it for remainder of test.
      const tx2 = await program.methods
        .transferOwnership(admin.publicKey)
        .accounts({ payer: payer.publicKey, config: configPDA })
        .signers([payer])
        .rpc();
      await provider.connection.confirmTransaction(tx2);
      const tx3 = await program.methods
        .acceptOwnership()
        .accounts({ payer: admin.publicKey, config: configPDA })
        .signers([admin])
        .rpc();
      await provider.connection.confirmTransaction(tx3);
      const cfg2 = await program.account.config.fetch(configPDA);
      expect(cfg2.admin.toBase58()).to.be.equal(admin.publicKey.toBase58());
    });
  });

  describe("Setters and getters", () => {
    describe("Pause", function () {
      it("pause: rejects when called by not a pauser", async () => {
        await expect(
          program.methods.pause().accounts({ payer: payer.publicKey, config: configPDA }).signers([payer]).rpc()
        ).to.be.rejectedWith("Unauthorized function call");
      });

      it("pause: successful by pauser", async () => {
        const tx2 = await program.methods
          .pause()
          .accounts({ payer: pauser.publicKey, config: configPDA })
          .signers([pauser])
          .rpc();
        await provider.connection.confirmTransaction(tx2);
        const cfg = await program.account.config.fetch(configPDA);
        expect(cfg.paused == true);
      });

      it("createMintPayload: rejects when paused", async () => {
        const mintPayload = new MintPayload(
          "f2e73f7c0259db5080fc2c6d3bcf7ca90712d3c2e5e6c28f27f0dfbb9953bdb0894c03abd55cad4b145c9fa6f0c634827d2d3a889bcd4e6e6a9527a89b2f8259bfcbc8f80000000000000000000000000000000000000000000000000000000000004e2000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000"
        );

        const mintPayloadPDA = PublicKey.findProgramAddressSync(
          [mintPayload.hashAsBytes()],
          program.programId
        )[0] as PublicKey;

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
        ).to.be.rejectedWith("LBTC contract is paused");
      });

      it("unpause: rejects when called by admin", async () => {
        const cfg = await program.account.config.fetch(configPDA);
        expect(cfg.paused == true);
        await expect(
          program.methods.unpause().accounts({ payer: admin.publicKey, config: configPDA }).signers([admin]).rpc()
        ).to.be.rejectedWith(
          "Error Code: Unauthorized. Error Number: 6000. Error Message: Unauthorized function call."
        );
      });

      it("unpause: successful by pauser", async () => {
        const tx = await program.methods
          .unpause()
          .accounts({ payer: pauser.publicKey, config: configPDA })
          .signers([pauser])
          .rpc();
        await provider.connection.confirmTransaction(tx);
        const cfg = await program.account.config.fetch(configPDA);
        expect(cfg.paused == false);
      });

      it("unpause: rejects when not paused", async () => {
        const cfg = await program.account.config.fetch(configPDA);
        expect(cfg.paused == true);
        await expect(
          program.methods.unpause().accounts({ payer: pauser.publicKey, config: configPDA }).signers([pauser]).rpc()
        ).to.be.rejectedWith("LBTC contract is not paused");
      });

      it("disableWithdrawals: successful by admin", async () => {
        const tx = await program.methods
          .disableWithdrawals()
          .accounts({ payer: admin.publicKey, config: configPDA })
          .signers([admin])
          .rpc();
        await provider.connection.confirmTransaction(tx);
        const cfg = await program.account.config.fetch(configPDA);
        expect(cfg.withdrawalsEnabled).to.be.false;
      });

      it("enableWithdrawals: successful by admin", async () => {
        const tx = await program.methods
          .enableWithdrawals()
          .accounts({ payer: admin.publicKey, config: configPDA })
          .signers([admin])
          .rpc();
        await provider.connection.confirmTransaction(tx);
        const cfg2 = await program.account.config.fetch(configPDA);
        expect(cfg2.withdrawalsEnabled).to.be.true;
      });

      it("enableWithdrawals: rejects when called by not admin", async () => {
        await expect(
          program.methods
            .enableWithdrawals()
            .accounts({ payer: payer.publicKey, config: configPDA })
            .signers([payer])
            .rpc()
        ).to.be.rejectedWith("An address constraint was violated");
      });

      it("disableWithdrawals: rejects when called by not admin", async () => {
        await expect(
          program.methods
            .disableWithdrawals()
            .accounts({ payer: payer.publicKey, config: configPDA })
            .signers([payer])
            .rpc()
        ).to.be.rejectedWith("An address constraint was violated");
      });
    });

    //Not implemented yet
    describe("Bascule", function () {
      it("enableBascule: successful by admin", async () => {
        const tx = await program.methods
          .enableBascule()
          .accounts({ payer: admin.publicKey, config: configPDA })
          .signers([admin])
          .rpc();
        await provider.connection.confirmTransaction(tx);
        const cfg = await program.account.config.fetch(configPDA);
        expect(cfg.basculeEnabled).to.be.true;
      });

      it("disableBascule: successful by admin", async () => {
        const tx = await program.methods
          .disableBascule()
          .accounts({ payer: admin.publicKey, config: configPDA })
          .signers([admin])
          .rpc();
        await provider.connection.confirmTransaction(tx);
        const cfg = await program.account.config.fetch(configPDA);
        expect(cfg.basculeEnabled).to.be.false;
      });

      it("enableBascule: rejects when called by not admin", async () => {
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

      it("disableBascule: rejects when called by not admin", async () => {
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
    });

    describe("Setters negative cases", function () {
      it("setOperator: rejects when called by not an admin", async () => {
        await expect(
          program.methods
            .setOperator(payer.publicKey)
            .accounts({ payer: payer.publicKey, config: configPDA })
            .signers([payer])
            .rpc()
        ).to.be.rejectedWith("An address constraint was violated");
      });

      it("setMintFee: rejects when called by not an operator", async () => {
        await expect(
          program.methods
            .setMintFee(new BN(10))
            .accounts({ payer: payer.publicKey, config: configPDA })
            .signers([payer])
            .rpc()
        ).to.be.rejectedWith("An address constraint was violated");
      });

      it("setBurnCommission: rejects when called by not admin", async () => {
        await expect(
          program.methods
            .setBurnCommission(new BN(10))
            .accounts({ payer: payer.publicKey, config: configPDA })
            .signers([payer])
            .rpc()
        ).to.be.rejectedWith("An address constraint was violated");
      });

      it("setDustFeeRate: rejects when called by not admin", async () => {
        await expect(
          program.methods
            .setDustFeeRate(new BN(3000))
            .accounts({ payer: payer.publicKey, config: configPDA })
            .signers([payer])
            .rpc()
        ).to.be.rejectedWith("An address constraint was violated");
      });

      it("setTreasury: rejects when called by not admin", async () => {
        await expect(
          program.methods
            .setTreasury()
            .accounts({ payer: payer.publicKey, config: configPDA, treasury })
            .signers([payer])
            .rpc()
        ).to.be.rejectedWith("An address constraint was violated");
      });

      it("setBascule: rejects when called by not admin", async () => {
        await expect(
          program.methods
            .setBascule(payer.publicKey)
            .accounts({ payer: payer.publicKey, config: configPDA })
            .signers([payer])
            .rpc()
        ).to.be.rejectedWith("An address constraint was violated");
      });

      it("addClaimer: rejects when called by not admin", async () => {
        await expect(
          program.methods
            .addClaimer(payer.publicKey)
            .accounts({ payer: payer.publicKey, config: configPDA })
            .signers([payer])
            .rpc()
        ).to.be.rejectedWith("An address constraint was violated");
      });

      it("addPauser: rejects when called by not admin", async () => {
        await expect(
          program.methods
            .addPauser(payer.publicKey)
            .accounts({ payer: payer.publicKey, config: configPDA })
            .signers([payer])
            .rpc()
        ).to.be.rejectedWith("An address constraint was violated");
      });
    });

    describe("Remove roles", function () {
      let newClaimer, newPauser;

      before(async function () {
        newClaimer = Keypair.generate();
        let tx = await program.methods
          .addClaimer(newClaimer.publicKey)
          .accounts({ payer: admin.publicKey, config: configPDA })
          .signers([admin])
          .rpc();
        await provider.connection.confirmTransaction(tx);

        newPauser = Keypair.generate();
        tx = await program.methods
          .addPauser(newPauser.publicKey)
          .accounts({ payer: admin.publicKey, config: configPDA })
          .signers([admin])
          .rpc();
        await provider.connection.confirmTransaction(tx);

        const cfg = await program.account.config.fetch(configPDA);
        expect(cfg.claimers[1].toBase58() == newClaimer.publicKey.toBase58());
        expect(cfg.pausers[1].toBase58() == newPauser.publicKey.toBase58());
      });

      it("removeClaimer: rejects when called by not admin", async () => {
        await expect(
          program.methods
            .removeClaimer(newClaimer.publicKey)
            .accounts({ payer: payer.publicKey, config: configPDA })
            .signers([payer])
            .rpc()
        ).to.be.rejectedWith("An address constraint was violated");
      });

      it("removeClaimer: successfully by admin", async () => {
        let tx = await program.methods
          .removeClaimer(newClaimer.publicKey)
          .accounts({ payer: admin.publicKey, config: configPDA })
          .signers([admin])
          .rpc();
        await provider.connection.confirmTransaction(tx);

        const cfg = await program.account.config.fetch(configPDA);
        expect(cfg.claimers).to.has.length(1);
      });

      it("removePauser: rejects when called by not admin", async () => {
        await expect(
          program.methods
            .removePauser(newPauser.publicKey)
            .accounts({ payer: payer.publicKey, config: configPDA })
            .signers([payer])
            .rpc()
        ).to.be.rejectedWith("An address constraint was violated");
      });

      it("removePauser: successfully by admin", async () => {
        let tx = await program.methods
          .removePauser(newPauser.publicKey)
          .accounts({ payer: admin.publicKey, config: configPDA })
          .signers([admin])
          .rpc();
        await provider.connection.confirmTransaction(tx);

        const cfg = await program.account.config.fetch(configPDA);
        expect(cfg.pausers).to.has.length(1);
      });
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

    const initialValsetHash = sha256(initialValset);
    const nextValsetHash = sha256(nextValset);

    const initialValidators = [
      Buffer.from(
        "ba5734d8f7091719471e7f7ed6b9df170dc70cc661ca05e688601ad984f068b0d67351e5f06073092499336ab0839ef8a521afd334e53807205fa2f08eec74f4",
        "hex"
      ),
      Buffer.from(
        "9d9031e97dd78ff8c15aa86939de9b1e791066a0224e331bc962a2099a7b1f0464b8bbafe1535f2301c72c2cb3535b172da30b02686ab0393d348614f157fbdb",
        "hex"
      )
    ];
    const nextValidators = [
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
    const initialWeights = [new BN(1), new BN(1)];
    const nextWeights = [new BN(1), new BN(1), new BN(1)];

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

    //Only admin can set initial valset
    describe("Initial valset by admin", function () {
      const metadataPDAPayer = PublicKey.findProgramAddressSync(
        [Buffer.from(initialValsetHash, "hex"), metadata_seed, payer.publicKey.toBuffer()],
        program.programId
      )[0];
      const payloadPDAPayer = PublicKey.findProgramAddressSync(
        [Buffer.from(initialValsetHash, "hex"), payer.publicKey.toBuffer()],
        program.programId
      )[0];

      it("createMetadataForValsetPayload: anyone can create", async () => {
        let tx = await program.methods
          .createMetadataForValsetPayload(Buffer.from(initialValsetHash, "hex"))
          .accounts({
            payer: payer.publicKey,
            metadata: metadataPDAPayer
          })
          .signers([payer])
          .rpc();
        await provider.connection.confirmTransaction(tx);
      });

      it("postMetadataForValsetPayload: rejects when posted by not the creator", async () => {
        await expect(
          program.methods
            .postMetadataForValsetPayload(Buffer.from(initialValsetHash, "hex"), initialValidators, initialWeights)
            .accounts({
              payer: admin.publicKey,
              metadata: metadataPDAPayer
            })
            .signers([admin])
            .rpc()
        ).to.be.rejectedWith("A seeds constraint was violated");
      });

      it("postMetadataForValsetPayload: successful by creator", async () => {
        const tx = await program.methods
          .postMetadataForValsetPayload(Buffer.from(initialValsetHash, "hex"), initialValidators, initialWeights)
          .accounts({
            payer: payer.publicKey,
            metadata: metadataPDAPayer
          })
          .signers([payer])
          .rpc();
        await provider.connection.confirmTransaction(tx);
      });

      it("createValsetPayload: rejects when called by not the creator", async () => {
        await expect(
          program.methods
            .createValsetPayload(Buffer.from(initialValsetHash, "hex"), new BN(1), new BN(1), new BN(1))
            .accounts({
              payer: admin.publicKey,
              config: configPDA,
              metadata: metadataPDAPayer,
              payload: payloadPDAPayer
            })
            .signers([admin])
            .rpc()
        ).to.be.rejectedWith("A seeds constraint was violated");
      });

      it("createValsetPayload: successful by the creator", async () => {
        let tx = await program.methods
          .createValsetPayload(Buffer.from(initialValsetHash, "hex"), new BN(1), new BN(1), new BN(1))
          .accounts({
            payer: payer.publicKey,
            config: configPDA,
            metadata: metadataPDAPayer,
            payload: payloadPDAPayer
          })
          .signers([payer])
          .rpc();
        await provider.connection.confirmTransaction(tx);
      });

      it("setInitialValset: rejects when called by not admin", async () => {
        await expect(
          program.methods
            .setInitialValset(Buffer.from(initialValsetHash, "hex"))
            .accounts({ payer: payer.publicKey, config: configPDA })
            .signers([payer])
            .rpc()
        ).to.be.rejectedWith("An address constraint was violated");
      });

      it("setInitialValset: successful by admin", async () => {
        const metadataPDA = PublicKey.findProgramAddressSync(
          [Buffer.from(initialValsetHash, "hex"), metadata_seed, admin.publicKey.toBuffer()],
          program.programId
        )[0];
        const payloadPDA = PublicKey.findProgramAddressSync(
          [Buffer.from(initialValsetHash, "hex"), admin.publicKey.toBuffer()],
          program.programId
        )[0];

        let tx = await program.methods
          .createMetadataForValsetPayload(Buffer.from(initialValsetHash, "hex"))
          .accounts({
            payer: admin.publicKey,
            metadata: metadataPDA
          })
          .signers([admin])
          .rpc();
        await provider.connection.confirmTransaction(tx);

        tx = await program.methods
          .postMetadataForValsetPayload(Buffer.from(initialValsetHash, "hex"), initialValidators, initialWeights)
          .accounts({
            payer: admin.publicKey,
            metadata: metadataPDA
          })
          .signers([admin])
          .rpc();
        await provider.connection.confirmTransaction(tx);

        tx = await program.methods
          .createValsetPayload(Buffer.from(initialValsetHash, "hex"), new BN(1), new BN(1), new BN(1))
          .accounts({
            payer: admin.publicKey,
            config: configPDA,
            metadata: metadataPDA,
            payload: payloadPDA
          })
          .signers([admin])
          .rpc();
        await provider.connection.confirmTransaction(tx);

        tx = await program.methods
          .setInitialValset(Buffer.from(initialValsetHash, "hex"))
          .accounts({ payer: admin.publicKey, config: configPDA })
          .signers([admin])
          .rpc();
        await provider.connection.confirmTransaction(tx);

        const cfg = await program.account.config.fetch(configPDA);
        expect(cfg.epoch.bigInt()).to.be.eq(1n);
        expect(cfg.weights.map(n => n.bigInt())).to.have.deep.members([1n, 1n]);
        expect(cfg.weightThreshold.bigInt()).to.be.eq(1n);
        expect(cfg.validators.map(v => Buffer.from(v))).to.have.deep.members(initialValidators);
      });

      it("setInitialValset: rejects when already set", async () => {
        const metadataPDA2 = PublicKey.findProgramAddressSync(
          [Buffer.from(nextValsetHash, "hex"), metadata_seed, admin.publicKey.toBuffer()],
          program.programId
        )[0];
        const payloadPDA2 = PublicKey.findProgramAddressSync(
          [Buffer.from(nextValsetHash, "hex"), admin.publicKey.toBuffer()],
          program.programId
        )[0];

        const tx = await program.methods
          .createMetadataForValsetPayload(Buffer.from(nextValsetHash, "hex"))
          .accounts({
            payer: admin.publicKey,
            metadata: metadataPDA2
          })
          .signers([admin])
          .rpc();
        await provider.connection.confirmTransaction(tx);

        const tx2 = await program.methods
          .postMetadataForValsetPayload(Buffer.from(nextValsetHash, "hex"), nextValidators, nextWeights)
          .accounts({
            payer: admin.publicKey,
            metadata: metadataPDA2
          })
          .signers([admin])
          .rpc();
        await provider.connection.confirmTransaction(tx2);

        const tx3 = await program.methods
          .createValsetPayload(Buffer.from(nextValsetHash, "hex"), new BN(2), new BN(2), new BN(1))
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
            .setInitialValset(Buffer.from(nextValsetHash, "hex"))
            .accounts({ payer: admin.publicKey, config: configPDA })
            .signers([admin])
            .rpc()
        ).to.be.rejectedWith("Validator set already set");
      });
    });

    //Any other account can set next valset with valid signatures
    describe("Next valset by anyone with valid signatures", function () {
      const metadataPDA2 = PublicKey.findProgramAddressSync(
        [Buffer.from(nextValsetHash, "hex"), metadata_seed, payer.publicKey.toBuffer()],
        program.programId
      )[0];
      const payloadPDA2 = PublicKey.findProgramAddressSync(
        [Buffer.from(nextValsetHash, "hex"), payer.publicKey.toBuffer()],
        program.programId
      )[0];

      before(async () => {
        const tx = await program.methods
          .createMetadataForValsetPayload(Buffer.from(nextValsetHash, "hex"))
          .accounts({
            payer: payer.publicKey,
            metadata: metadataPDA2
          })
          .signers([payer])
          .rpc();
        await provider.connection.confirmTransaction(tx);
      });

      it("setNextValset: when signatures are invalid", async () => {
        const tx2 = await program.methods
          .postMetadataForValsetPayload(Buffer.from(nextValsetHash, "hex"), nextValidators, nextWeights)
          .accounts({
            payer: payer.publicKey,
            metadata: metadataPDA2
          })
          .signers([payer])
          .rpc();
        await provider.connection.confirmTransaction(tx2);

        const tx3 = await program.methods
          .createValsetPayload(Buffer.from(nextValsetHash, "hex"), new BN(2), new BN(2), new BN(1))
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
            .setNextValset(Buffer.from(nextValsetHash, "hex"))
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

      it("postValsetSignatures: ignores invalid signatures", async () => {
        const tx = await program.methods
          .postValsetSignatures(Buffer.from(nextValsetHash, "hex"), wrongSigs, [new BN(0), new BN(1)])
          .accounts({
            payer: payer.publicKey,
            config: configPDA,
            payload: payloadPDA2
          })
          .signers([payer])
          .rpc();
        await provider.connection.confirmTransaction(tx);

        const payload2 = await program.account.valsetPayload.fetch(payloadPDA2);
        expect(payload2.weight.bigInt()).to.be.eq(0n);
      });

      it("postValsetSignatures: ignores duplicates", async () => {
        const tx = await program.methods
          .postValsetSignatures(Buffer.from(nextValsetHash, "hex"), [sigs[0], sigs[0]], [new BN(0), new BN(0)])
          .accounts({
            payer: payer.publicKey,
            config: configPDA,
            payload: payloadPDA2
          })
          .signers([payer])
          .rpc();
        await provider.connection.confirmTransaction(tx);

        const payload = await program.account.valsetPayload.fetch(payloadPDA2);
        expect(payload.weight.bigInt()).to.be.eq(1n);

        const tx2 = await program.methods
          .postValsetSignatures(Buffer.from(nextValsetHash, "hex"), [sigs[0]], [new BN(0)])
          .accounts({
            payer: payer.publicKey,
            config: configPDA,
            payload: payloadPDA2
          })
          .signers([payer])
          .rpc();
        await provider.connection.confirmTransaction(tx2);

        const payload2 = await program.account.valsetPayload.fetch(payloadPDA2);
        expect(payload2.weight.bigInt()).to.be.eq(1n);
      });

      it("setNextValset: successful", async () => {
        const payload = await program.account.valsetPayload.fetch(payloadPDA2);
        expect(payload.weight.bigInt()).to.be.eq(1n);

        let tx = await program.methods
          .postValsetSignatures(Buffer.from(nextValsetHash, "hex"), sigs, [new BN(0), new BN(1)])
          .accounts({
            payer: payer.publicKey,
            config: configPDA,
            payload: payloadPDA2
          })
          .signers([payer])
          .rpc();
        await provider.connection.confirmTransaction(tx);

        const payload2 = await program.account.valsetPayload.fetch(payloadPDA2);
        expect(payload2.weight.bigInt()).to.be.eq(2n);

        tx = await program.methods
          .setNextValset(Buffer.from(nextValsetHash, "hex"))
          .accounts({
            payer: payer.publicKey,
            config: configPDA,
            metadata: metadataPDA2,
            payload: payloadPDA2
          })
          .signers([payer])
          .rpc();
        await provider.connection.confirmTransaction(tx);

        const cfg = await program.account.config.fetch(configPDA);
        expect(cfg.epoch.bigInt()).to.be.eq(2n);
        expect(cfg.weights.map(n => n.bigInt())).to.have.deep.members([1n, 1n, 1n]);
        expect(cfg.weightThreshold.bigInt()).to.be.eq(2n);
        expect(cfg.validators.map(v => Buffer.from(v))).to.have.deep.members(nextValidators);
      });
    });
  });

  describe("Minting and redeeming", () => {
    let userTA: PublicKey;
    let minterTA: PublicKey;

    const scriptPubkey = [0, 20, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2];

    const mintPayload = new MintPayload(
      "f2e73f7c0259db5080fc2c6d3bcf7ca90712d3c2e5e6c28f27f0dfbb9953bdb0894c03abd55cad4b145c9fa6f0c634827d2d3a889bcd4e6e6a9527a89b2f8259bfcbc8f8000000000000000000000000000000000000000000000000000000000000271000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000"
    );
    const mintPayload2 = new MintPayload(
      "f2e73f7c0259db5080fc2c6d3bcf7ca90712d3c2e5e6c28f27f0dfbb9953bdb0894c03abd55cad4b145c9fa6f0c634827d2d3a889bcd4e6e6a9527a89b2f8259bfcbc8f80000000000000000000000000000000000000000000000000000000000004e2000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000"
    );

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

    const mintPayloadPDA = PublicKey.findProgramAddressSync(
      [mintPayload.hashAsBytes()],
      program.programId
    )[0] as PublicKey;
    const mintPayloadPDA2 = PublicKey.findProgramAddressSync(
      [mintPayload2.hashAsBytes()],
      program.programId
    )[0] as PublicKey;

    const feePermit = new FeePermit(program.programId.toBuffer().toString("hex"), 3);

    const events = [];

    before(async () => {
      userTA = await spl.createAssociatedTokenAccount(provider.connection, user, mint, user.publicKey);
      console.log("userTA: ", userTA.toBase58());
      minterTA = await spl.createAssociatedTokenAccount(provider.connection, minter, mint, minter.publicKey);
      console.log("minterTA: ", minterTA.toBase58());

      //Subscribe for events
      program.addEventListener("mintProofConsumed", (event, slot, signature) => {
        events.push(event);
      });
    });

    beforeEach(async () => {
      events.length = 0;
    });

    //Any account can create mint payload
    describe("Create mint payload", function () {
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
        },
        {
          name: "Payload is too long",
          modifier: (payload: MintPayload): [Buffer, Buffer] => {
            payload.vout += "aa";
            return [payload.bytes(), payload.hashAsBytes()];
          },
          error: "Passed mint payload hash does not match computed hash"
        },
        {
          name: "Payload is too short",
          modifier: (payload: MintPayload): [Buffer, Buffer] => {
            payload.vout = "aa";
            return [payload.bytes(), payload.hashAsBytes()];
          },
          error: "The program could not deserialize the given instruction"
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
          const pda = PublicKey.findProgramAddressSync([hash], program.programId)[0];
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

      it("createMintPayload: successful", async () => {
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

        const payload = await program.account.mintPayload.fetch(mintPayloadPDA);
        expect(payload.payload.map(num => num.toString(16).padStart(2, "0")).join("")).to.be.eq(mintPayload.hex());
        expect(payload.signed).to.have.members([false, false, false]);
        expect(payload.weight.bigInt()).to.be.eq(0n);
        expect(payload.minted).to.be.false;
      });

      it("createMintPayload: rejects when payload already submitted", async () => {
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
        ).to.be.rejectedWith(
          "Transaction simulation failed: Error processing Instruction 0: custom program error: 0x0"
        );
      });
    });

    /*
    To mint with payload account have to:
    1. Create mint payload
    2. Post sufficient number of signatures
    3. Mint
     */
    describe("Add signatures and mint with payload", function () {
      it("mintFromPayload: rejects when there are no signatures", async () => {
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
            .rpc()
        ).to.be.rejectedWith("NotEnoughSignatures");
      });

      // Any account can add mint signatures
      it("postMintSignatures: successful", async () => {
        const tx = await program.methods
          .postMintSignatures(mintPayload.hashAsBytes(), [mintSigs[0]], [new BN(0)])
          .accounts({ config: configPDA, payload: mintPayloadPDA })
          .rpc();
        await provider.connection.confirmTransaction(tx);

        const payload = await program.account.mintPayload.fetch(mintPayloadPDA);
        expect(payload.payload.map(num => num.toString(16).padStart(2, "0")).join("")).to.be.eq(mintPayload.hex());
        expect(payload.signed).to.have.members([true, false, false]);
        expect(payload.weight.bigInt()).to.be.eq(1n);
        expect(payload.minted).to.be.false;
      });

      it("mintFromPayload: rejects when not enough signatures", async () => {
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
            .rpc()
        ).to.be.rejectedWith("NotEnoughSignatures");
      });

      const rejected_signatures = [
        {
          name: "array lengths do not match",
          payload: mintPayload,
          signatures: [mintSigs[0]],
          indices: [],
          payloadPDA: mintPayloadPDA,
          error: "Mismatch between signatures and indices length"
        },
        {
          name: "unknown validator id",
          payload: mintPayload,
          signatures: [mintSigs[0]],
          indices: [new BN(4)],
          payloadPDA: mintPayloadPDA,
          error: "Transaction simulation failed: Error processing Instruction 0: Program failed to complete"
        }
      ];

      rejected_signatures.forEach(function (arg) {
        it(`postMintSignatures: rejects when ${arg.name}`, async () => {
          await expect(
            program.methods
              .postMintSignatures(arg.payload.hashAsBytes(), arg.signatures, arg.indices)
              .accounts({ config: configPDA, payload: arg.payloadPDA })
              .rpc()
          ).to.be.rejectedWith(arg.error);
        });
      });

      const ignored_signatures = [
        {
          name: "arrays are empty",
          payload: mintPayload,
          signatures: [],
          indices: [],
          payloadPDA: mintPayloadPDA
        },
        {
          name: "signatures are invalid",
          payload: mintPayload,
          signatures: [mintSigs[0]],
          indices: [new BN(1)],
          payloadPDA: mintPayloadPDA
        },
        {
          name: "one of the signatures is invalid",
          payload: mintPayload,
          signatures: [mintSigs[0], mintSigs[1]],
          indices: [new BN(0), new BN(0)],
          payloadPDA: mintPayloadPDA
        },
        {
          name: "arrays contain duplicates",
          payload: mintPayload,
          signatures: [mintSigs[0], mintSigs[0]],
          indices: [new BN(0), new BN(0)],
          payloadPDA: mintPayloadPDA
        }
      ];

      ignored_signatures.forEach(function (arg) {
        it(`postMintSignatures: ignores when ${arg.name}`, async () => {
          const tx = await program.methods
            .postMintSignatures(arg.payload.hashAsBytes(), arg.signatures, arg.indices)
            .accounts({ config: configPDA, payload: arg.payloadPDA })
            .rpc();
          await provider.connection.confirmTransaction(tx);

          const payload = await program.account.mintPayload.fetch(arg.payloadPDA);
          expect(payload.weight.bigInt()).to.be.eq(1n);
        });
      });

      it("postMintSignatures: can add missing signatures to payload", async () => {
        const tx = await program.methods
          .postMintSignatures(mintPayload.hashAsBytes(), mintSigs, [new BN(0), new BN(2)])
          .accounts({ config: configPDA, payload: mintPayloadPDA, payer: payer.publicKey })
          .rpc();
        await provider.connection.confirmTransaction(tx);

        const payload = await program.account.mintPayload.fetch(mintPayloadPDA);
        expect(payload.payload.map(num => num.toString(16).padStart(2, "0")).join("")).to.be.eq(mintPayload.hex());
        expect(payload.signed).to.have.members([true, false, true]);
        expect(payload.weight.bigInt()).to.be.eq(2n);
        expect(payload.minted).to.be.false;
      });

      it("mintFromPayload: rejects when recipient does not match address in payload", async () => {
        await expect(
          program.methods
            .mintFromPayload(mintPayload.hashAsBytes())
            .accounts({
              config: configPDA,
              tokenProgram: spl.TOKEN_PROGRAM_ID,
              recipient: minterTA,
              mint: mint,
              tokenAuthority: tokenAuth,
              payload: mintPayloadPDA,
              bascule: payer.publicKey
            })
            .rpc()
        ).to.be.rejectedWith("Mismatch between mint payload and passed account");
      });

      it("mintFromPayload: successful", async () => {
        const balanceBefore = await spl.getAccount(provider.connection, mintPayload.recipientPubKey());
        console.log("balance before:", balanceBefore.amount);

        const tx = await program.methods
          .mintFromPayload(mintPayload.hashAsBytes())
          .accounts({
            config: configPDA,
            tokenProgram: spl.TOKEN_PROGRAM_ID,
            recipient: mintPayload.recipientPubKey(),
            mint: mint,
            tokenAuthority: tokenAuth,
            payload: mintPayloadPDA,
            bascule: payer.publicKey
          })
          .rpc();
        await provider.connection.confirmTransaction(tx);

        const payload = await program.account.mintPayload.fetch(mintPayloadPDA);
        expect(payload.payload.map(num => num.toString(16).padStart(2, "0")).join("")).to.be.eq(mintPayload.hex());
        expect(payload.signed).to.have.members([true, false, true]);
        expect(payload.weight.bigInt()).to.be.eq(2n);
        expect(payload.minted).to.be.true;

        const balanceAfter = await spl.getAccount(provider.connection, mintPayload.recipientPubKey());
        console.log("dest address balance after:", balanceAfter.amount);

        expect(balanceAfter.amount - balanceBefore.amount).to.be.eq(mintPayload.amountBigInt());

        //Event
        expect(events).to.be.not.empty;
        console.log(JSON.stringify(events[0]));
        expect(events[0].recipient).to.be.deep.eq(mintPayload.recipientPubKey());
        expect(Buffer.from(events[0].payloadHash)).to.be.deep.eq(mintPayload.hashAsBytes());
      });

      it("mintFromPayload: rejects when already minted", async () => {
        await expect(
          program.methods
            .mintFromPayload(mintPayload.hashAsBytes())
            .accounts({
              config: configPDA,
              tokenProgram: spl.TOKEN_PROGRAM_ID,
              recipient: mintPayload.recipientPubKey(),
              mint: mint,
              tokenAuthority: tokenAuth,
              payload: mintPayloadPDA,
              bascule: payer.publicKey
            })
            .rpc()
        ).to.be.rejectedWith("Mint payload already used");
      });

      it("postMintSignatures: after mint does not change the status", async () => {
        const tx = await program.methods
          .postMintSignatures(mintPayload.hashAsBytes(), mintSigs, [new BN(0), new BN(2)])
          .accounts({ config: configPDA, payload: mintPayloadPDA, payer: payer.publicKey })
          .rpc();
        await provider.connection.confirmTransaction(tx);

        const payload = await program.account.mintPayload.fetch(mintPayloadPDA);
        expect(payload.payload.map(num => num.toString(16).padStart(2, "0")).join("")).to.be.eq(mintPayload.hex());
        expect(payload.signed).to.have.members([true, false, true]);
        expect(payload.weight.bigInt()).to.be.eq(2n);
        expect(payload.minted).to.be.true;
      });
    });

    //Only claimer role can mint with fee
    describe("Mint with fee by claimer", async () => {
      before(async () => {
        let tx = await program.methods
          .createMintPayload(mintPayload2.hashAsBytes(), mintPayload2.bytes())
          .accounts({
            payer: payer.publicKey,
            config: configPDA,
            payload: mintPayloadPDA2
          })
          .signers([payer])
          .rpc();
        await provider.connection.confirmTransaction(tx);

        tx = await program.methods
          .postMintSignatures(mintPayload2.hashAsBytes(), [mintSigs2[0]], [new BN(0)])
          .accounts({ config: configPDA, payload: mintPayloadPDA2 })
          .rpc();
        await provider.connection.confirmTransaction(tx);
      });

      it("mintWithFee: rejects when not enough signatures", async () => {
        await expect(
          program.methods
            .mintWithFee(mintPayload2.hashAsBytes(), feePermit.bytes(), feePermit.signature(recipient.secretKey))
            .accounts({
              payer: claimer.publicKey,
              config: configPDA,
              tokenProgram: spl.TOKEN_PROGRAM_ID,
              recipientAuth: recipient.publicKey,
              recipient: mintPayload2.recipientPubKey(),
              mint: mint,
              tokenAuthority: tokenAuth,
              treasury: treasury,
              payload: mintPayloadPDA2,
              bascule: payer.publicKey
            })
            .signers([claimer])
            .rpc()
        ).to.be.rejectedWith("Not enough valid signatures");
      });

      it("mintWithFee: rejects when called by not a claimer", async () => {
        let tx = await program.methods
          .postMintSignatures(mintPayload2.hashAsBytes(), mintSigs2, [new BN(0), new BN(2)])
          .accounts({ config: configPDA, payload: mintPayloadPDA2 })
          .rpc();
        await provider.connection.confirmTransaction(tx);

        await expect(
          program.methods
            .mintWithFee(mintPayload2.hashAsBytes(), feePermit.bytes(), feePermit.signature(recipient.secretKey))
            .accounts({
              payer: payer.publicKey,
              config: configPDA,
              tokenProgram: spl.TOKEN_PROGRAM_ID,
              recipientAuth: recipient.publicKey,
              recipient: mintPayload2.recipientPubKey(),
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

      it("mintWithFee: rejects when treasury is invalid", async () => {
        await expect(
          program.methods
            .mintWithFee(mintPayload2.hashAsBytes(), feePermit.bytes(), feePermit.signature(recipient.secretKey))
            .accounts({
              payer: claimer.publicKey,
              config: configPDA,
              tokenProgram: spl.TOKEN_PROGRAM_ID,
              recipientAuth: recipient.publicKey,
              recipient: mintPayload2.recipientPubKey(),
              mint: mint,
              tokenAuthority: tokenAuth,
              treasury: payer.publicKey,
              payload: mintPayloadPDA2,
              bascule: payer.publicKey
            })
            .signers([claimer])
            .rpc()
        ).to.be.rejectedWith("The given account is owned by a different program than expected");
      });

      it("mintWithFee: rejects when recipient does not match address in payload", async () => {
        await expect(
          program.methods
            .mintWithFee(mintPayload2.hashAsBytes(), feePermit.bytes(), feePermit.signature(recipient.secretKey))
            .accounts({
              payer: claimer.publicKey,
              config: configPDA,
              tokenProgram: spl.TOKEN_PROGRAM_ID,
              recipientAuth: user.publicKey,
              recipient: userTA,
              mint: mint,
              tokenAuthority: tokenAuth,
              treasury: treasury,
              payload: mintPayloadPDA2,
              bascule: payer.publicKey
            })
            .signers([claimer])
            .rpc()
        ).to.be.rejectedWith("Mismatch between mint payload and passed account");
      });

      it("mintWithFee: rejects when amount < fee", async () => {
        let tx = await program.methods
          .setMintFee(new BN(100_000))
          .accounts({ payer: operator.publicKey, config: configPDA })
          .signers([operator])
          .rpc();
        await provider.connection.confirmTransaction(tx);

        const feePermit = new FeePermit(program.programId.toBuffer().toString("hex"), 3);
        feePermit.maxFees = "0000000000000000000000000000000000000000000000000000000000989680";

        await expect(
          program.methods
            .mintWithFee(mintPayload2.hashAsBytes(), feePermit.bytes(), feePermit.signature(recipient.secretKey))
            .accounts({
              payer: claimer.publicKey,
              config: configPDA,
              tokenProgram: spl.TOKEN_PROGRAM_ID,
              recipientAuth: recipient.publicKey,
              recipient: mintPayload2.recipientPubKey(),
              mint: mint,
              tokenAuthority: tokenAuth,
              treasury: treasury,
              payload: mintPayloadPDA2,
              bascule: payer.publicKey
            })
            .signers([claimer])
            .rpc()
        ).to.be.rejectedWith("Fee is greater than or equal to amount");
      });

      const invalid_permits = [
        {
          name: "permit prefix is invalid",
          modifier: (permit: FeePermit): [Buffer, Buffer] => {
            permit.prefix = "04acbbb3";
            return [permit.bytes(), permit.signature(recipient.secretKey)];
          },
          error: "Invalid action bytes"
        },
        {
          name: "permit chainId is invalid",
          modifier: (permit: FeePermit): [Buffer, Buffer] => {
            permit.chainId = "0259db5080fc2c6d3bcf7ca90712d3c2e5e6c28f27f0dfbb9953bdb0894c03ac";
            return [permit.bytes(), permit.signature(recipient.secretKey)];
          },
          error: "Invalid chain ID"
        },
        {
          name: "permit programId is invalid",
          modifier: (permit: FeePermit): [Buffer, Buffer] => {
            permit.programId = "42ed4c495cbedc8a5d4b213fe18ba748ebe91264b9a64bea611054af21ad0a8e";
            return [permit.bytes(), permit.signature(recipient.secretKey)];
          },
          error: "Invalid verifying contract"
        },
        {
          name: "permit is expired",
          modifier: (permit: FeePermit): [Buffer, Buffer] => {
            permit.expire = "000000000000000000000000000000000000000000000000000000000000000f";
            return [permit.bytes(), permit.signature(recipient.secretKey)];
          },
          error: "Fee approval expired"
        },
        {
          name: "permit signature is invalid",
          modifier: (permit: FeePermit): [Buffer, Buffer] => {
            return [permit.bytes(), feePermit.signature(user.secretKey)];
          },
          error: "Fee signature invalid"
        },
        {
          name: "permit length is invalid",
          modifier: (permit: FeePermit): [Buffer, Buffer] => {
            permit.expire += "000000000000000000000000000000000000000000000000000000000000000f";
            return [permit.bytes(), permit.signature(recipient.secretKey)];
          },
          error: "Fee signature invalid"
        }
      ];

      invalid_permits.forEach(function (arg) {
        it(`mintWithFee: rejects when ${arg.name}`, async () => {
          const feePermit = new FeePermit(program.programId.toBuffer().toString("hex"), 3);
          const [permit, signature] = arg.modifier(feePermit);

          await expect(
            program.methods
              .mintWithFee(mintPayload2.hashAsBytes(), permit, signature)
              .accounts({
                payer: claimer.publicKey,
                config: configPDA,
                tokenProgram: spl.TOKEN_PROGRAM_ID,
                recipientAuth: recipient.publicKey,
                recipient: mintPayload2.recipientPubKey(),
                mint: mint,
                tokenAuthority: tokenAuth,
                treasury: treasury,
                payload: mintPayloadPDA2,
                bascule: payer.publicKey
              })
              .signers([claimer])
              .rpc()
          ).to.be.rejectedWith(arg.error);
        });
      });

      it("mintWithFee: successful", async () => {
        let tx = await program.methods
          .setMintFee(new BN(10))
          .accounts({ payer: operator.publicKey, config: configPDA })
          .signers([operator])
          .rpc();
        await provider.connection.confirmTransaction(tx);

        const recipientBalanceBefore = await spl.getAccount(provider.connection, mintPayload2.recipientPubKey());
        const treasuryBalanceBefore = await spl.getAccount(provider.connection, treasury);

        tx = await program.methods
          .mintWithFee(mintPayload2.hashAsBytes(), feePermit.bytes(), feePermit.signature(recipient.secretKey))
          .accounts({
            payer: claimer.publicKey,
            config: configPDA,
            tokenProgram: spl.TOKEN_PROGRAM_ID,
            recipientAuth: recipient.publicKey,
            recipient: mintPayload2.recipientPubKey(),
            mint: mint,
            tokenAuthority: tokenAuth,
            treasury: treasury,
            payload: mintPayloadPDA2,
            bascule: payer.publicKey
          })
          .signers([claimer])
          .rpc();
        await provider.connection.confirmTransaction(tx);

        const recipientBalanceAfter = await spl.getAccount(provider.connection, mintPayload2.recipientPubKey());
        const treasuryBalanceAfter = await spl.getAccount(provider.connection, treasury);

        // Asserting balance after the mint
        let cfg = await program.account.config.fetch(configPDA);
        console.log("Config mint fees:", cfg.mintFee.bigInt());
        console.log("Permit max fees:", feePermit.maxFeesBigInt());
        // Going to take the least fee value from permit and config
        const finalFees =
          cfg.mintFee.bigInt() < feePermit.maxFeesBigInt() ? cfg.mintFee.bigInt() : feePermit.maxFeesBigInt();
        expect(recipientBalanceAfter.amount - recipientBalanceBefore.amount).to.be.eq(
          mintPayload2.amountBigInt() - finalFees
        );
        // Treasury received fees
        expect(treasuryBalanceAfter.amount - treasuryBalanceBefore.amount).to.be.eq(finalFees);

        //Event
        expect(events).to.be.not.empty;
        console.log(JSON.stringify(events[0]));
        expect(events[0].recipient).to.be.deep.eq(mintPayload2.recipientPubKey());
        expect(Buffer.from(events[0].payloadHash)).to.be.deep.eq(mintPayload2.hashAsBytes());
      });

      it("mintWithFee: rejects when already minted", async () => {
        await expect(
          program.methods
            .mintWithFee(mintPayload2.hashAsBytes(), feePermit.bytes(), feePermit.signature(recipient.secretKey))
            .accounts({
              payer: claimer.publicKey,
              config: configPDA,
              tokenProgram: spl.TOKEN_PROGRAM_ID,
              recipientAuth: recipient.publicKey,
              recipient: mintPayload2.recipientPubKey(),
              mint: mint,
              tokenAuthority: tokenAuth,
              treasury: treasury,
              payload: mintPayloadPDA2,
              bascule: payer.publicKey
            })
            .signers([claimer])
            .rpc()
        ).to.be.rejectedWith("Mint payload already used");
      });
    });

    //Mint and redeem do not work when pause is enabled
    describe("Pause", () => {
      before(async () => {
        const tx2 = await program.methods
          .pause()
          .accounts({ payer: pauser.publicKey, config: configPDA })
          .signers([pauser])
          .rpc();
        await provider.connection.confirmTransaction(tx2);
        const cfg = await program.account.config.fetch(configPDA);
        expect(cfg.paused == true);
      });

      after(async () => {
        const tx = await program.methods
          .unpause()
          .accounts({ payer: pauser.publicKey, config: configPDA })
          .signers([pauser])
          .rpc();
        await provider.connection.confirmTransaction(tx);
        const cfg = await program.account.config.fetch(configPDA);
        expect(cfg.paused == false);
      });

      it("postMintSignatures: rejects when paused", async () => {
        await expect(
          program.methods
            .postMintSignatures(mintPayload2.hashAsBytes(), [mintSigs[0]], [new BN(0)])
            .accounts({ config: configPDA, payload: mintPayloadPDA2 })
            .rpc()
        ).to.be.rejectedWith("LBTC contract is paused");
      });

      it("mintFromPayload: rejects when paused", async () => {
        await expect(
          program.methods
            .mintFromPayload(mintPayload2.hashAsBytes())
            .accounts({
              config: configPDA,
              tokenProgram: spl.TOKEN_PROGRAM_ID,
              recipient: mintPayload2.recipientPubKey(),
              mint: mint,
              tokenAuthority: tokenAuth,
              payload: mintPayloadPDA2,
              bascule: payer.publicKey
            })
            .rpc()
        ).to.be.rejectedWith("LBTC contract is paused");
      });

      it("mintWithFee: rejects when paused", async () => {
        await expect(
          program.methods
            .mintWithFee(mintPayload2.hashAsBytes(), feePermit.bytes(), feePermit.signature(recipient.secretKey))
            .accounts({
              payer: claimer.publicKey,
              config: configPDA,
              tokenProgram: spl.TOKEN_PROGRAM_ID,
              recipientAuth: recipient.publicKey,
              recipient: mintPayload2.recipientPubKey(),
              mint: mint,
              tokenAuthority: tokenAuth,
              treasury: treasury,
              payload: mintPayloadPDA2,
              bascule: payer.publicKey
            })
            .signers([claimer])
            .rpc()
        ).to.be.rejectedWith("LBTC contract is paused");
      });

      it("redeem: rejects when paused", async () => {
        await expect(
          program.methods
            .redeem(Buffer.from(scriptPubkey), new BN(1000))
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
        ).to.be.rejectedWith("LBTC contract is paused");
      });
    });

    describe("Redeem", function () {
      it("redeem: rejects when withdrawals are disabled", async () => {
        let tx = await program.methods
          .disableWithdrawals()
          .accounts({ payer: admin.publicKey, config: configPDA })
          .signers([admin])
          .rpc();
        await provider.connection.confirmTransaction(tx);

        await expect(
          program.methods
            .redeem(Buffer.from(scriptPubkey), new BN(1000))
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

        tx = await program.methods
          .enableWithdrawals()
          .accounts({ payer: admin.publicKey, config: configPDA })
          .signers([admin])
          .rpc();
        await provider.connection.confirmTransaction(tx);
      });

      it("redeem: rejects when insufficient funds", async () => {
        await expect(
          program.methods
            .redeem(Buffer.from(scriptPubkey), new BN(2000))
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
        ).to.be.rejectedWith("insufficient funds");
      });

      it("redeem: rejects when amount < burn fee", async () => {
        await expect(
          program.methods
            .redeem(Buffer.from(scriptPubkey), new BN(10))
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

      it("redeem: rejects when amount < dust limit", async () => {
        await expect(
          program.methods
            .redeem(Buffer.from(scriptPubkey), new BN(304))
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

      it("redeem: rejects when script pubkey is invalid", async () => {
        await expect(
          program.methods
            .redeem(Buffer.from([0, 1, 2]), new BN(1000))
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

      it("redeem: rejects when treasury is invalid", async () => {
        await expect(
          program.methods
            .redeem(Buffer.from(scriptPubkey), new BN(1000))
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
        ).to.be.rejectedWith("An address constraint was violated");
      });

      it("redeem: successful", async () => {
        const amount = new BN(1000);
        const userBalanceBefore = await spl.getAccount(provider.connection, recipientTA);
        const treasuryBalanceBefore = await spl.getAccount(provider.connection, treasury);
        console.log("users balance before:", userBalanceBefore.amount);
        console.log("treasury balance before:", treasuryBalanceBefore.amount);

        const tx = await program.methods
          .redeem(Buffer.from(scriptPubkey), amount)
          .accounts({
            payer: recipient.publicKey,
            holder: recipientTA,
            config: configPDA,
            tokenProgram: spl.TOKEN_PROGRAM_ID,
            mint: mint,
            treasury: treasury
          })
          .signers([recipient])
          .rpc();
        await provider.connection.confirmTransaction(tx);

        const userBalanceAfter = await spl.getAccount(provider.connection, recipientTA);
        const treasuryBalanceAfter = await spl.getAccount(provider.connection, treasury);
        const cfg = await program.account.config.fetch(configPDA);
        console.log("users balance after:", userBalanceAfter.amount);
        console.log("treasury balance after:", treasuryBalanceAfter.amount);
        console.log("redeem fee:", cfg.burnCommission.bigInt());

        expect(userBalanceBefore.amount - userBalanceAfter.amount).to.be.eq(amount.bigInt());
        expect(treasuryBalanceAfter.amount - treasuryBalanceBefore.amount).to.be.eq(cfg.burnCommission.bigInt());
        expect(cfg.unstakeCounter.bigInt()).to.be.eq(1n);

        const unstakeInfoPDA = PublicKey.findProgramAddressSync(
          [new BN(cfg.unstakeCounter - 1).toArrayLike(Buffer, "le", 8)],
          program.programId
        )[0];
        const unstakeInfo = await program.account.unstakeInfo.fetch(unstakeInfoPDA);
        expect(unstakeInfo.from == recipient.publicKey);
        expect(unstakeInfo.scriptPubkey == scriptPubkey);
        expect(unstakeInfo.amount == amount - cfg.burnCommission);
      });
    });
  });
});
