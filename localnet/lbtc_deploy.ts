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
import { ethers } from "ethers";
import base = Mocha.reporters.base;

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

function parseValSetFromHex(hex) {
  const abiTypes = [
    "uint256", // epoch
    "bytes[]", // validator pubkeys (each 65 bytes)
    "uint256[]", // weights
    "uint256", // weightThreshold
    "uint256" // height
  ];
  // Decode using ethers ABI coder
  const abiCoder = ethers.AbiCoder.defaultAbiCoder();
  const decoded = abiCoder.decode(abiTypes, "0x" + hex.toString("hex").replace(/^4aab1d6f/, ""));

  return {
    epoch: new BN(decoded[0]),
    pubkeys: decoded[1].map(pk => Buffer.from(pk.replace(/^0x\w{2}/, ""), "hex")),
    weights: decoded[2].map(w => new BN(w)),
    weightThreshold: new BN(decoded[3]),
    height: new BN(decoded[4])
  };
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

  payer = Keypair.fromSecretKey(
    bs58.decode("39wPFeuYiSKyMSjv915xatbkswAMYJBgECF3CQwcqhiuhhnjZhh2rEniN2B1L78Jyz75u6rWTd4JtfkSqV5JaTwP")
  );
  user = Keypair.generate();
  admin = Keypair.fromSecretKey(
    bs58.decode("4mDv1GRNxLJJYwyX5pPD2182BECJPaAm7vUKefxCH7oaVGMeGGPTmMnxrHudR14Lg14yfa3xDaH2FuLfQZqFbNLP")
  );
  operator = Keypair.generate();
  pauser = Keypair.generate();
  minter = Keypair.fromSecretKey(
    bs58.decode("3AbZhXyceMcP9rCAvaZTtUmAJL3xnwJePjP2SrXi9gWYW6pHLNGXKjic1hva9kWaBf2Ev4PiqjG6pa44kVLhQ1BD")
  );
  claimer = Keypair.fromSecretKey(
    bs58.decode("4yrvNcRWyyFafqXgNttdn25BpNUzKfSiBjaYyonLWeczj6Jt5ek83D2dkFM3KmQdUrVkWdwSc2EtTh7PvPBaABXR")
  );
  const t = Keypair.fromSecretKey(
    bs58.decode("3G1d1Zsg3xdX8sV2gkPoDqedKxBycAVhGuznjWBWwKJ7MmipNx8gXshusrGHxFpZz7azV8pwJ77ivLtyLgzwz1HB")
  );
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

    console.log("Payer private key:", bs58.encode(provider.wallet.payer.secretKey));
    console.log("Payer public key: ", provider.wallet.payer.publicKey.toBase58());

    console.log("Claimer private key:", bs58.encode(claimer.secretKey));
    console.log("Claimer public key: ", claimer.publicKey.toBase58());

    console.log("Admin private key:", bs58.encode(admin.secretKey));
    console.log("Admin public key: ", admin.publicKey.toBase58());

    console.log("Minter private key:", bs58.encode(minter.secretKey));
    console.log("Minter public key: ", minter.publicKey.toBase58());

    console.log("t private key:", bs58.encode(t.secretKey));
    console.log("t public key: ", t.publicKey.toBase58());

    console.log("Mint Authority:", tokenAuth.toBase58());

    mint = await spl.createMint(provider.connection, admin, tokenAuth, admin.publicKey, 8, mintKeys);
    console.log("Mint:", mint.toBase58());

    [configPDA] = PublicKey.findProgramAddressSync([Buffer.from("lbtc_config")], program.programId);
    console.log("Config PDA:", configPDA.toBase58());

    treasury = await spl.createAssociatedTokenAccount(provider.connection, t, mint, t.publicKey);
    console.log("Treasury:", treasury.toBase58());

    recipientTA = await spl.createAssociatedTokenAccount(provider.connection, recipient, mint, recipient.publicKey);
  });

  describe("Initialize and set roles", function () {
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
  });

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
  });

  describe("Consortium actions", () => {
    //Staging
    //from https://holesky.etherscan.io/tx/0x0f9232cd7aea5350588f4a700490870e538c136bd8c2ecfee24fe469779dd8ee
    const valsetHex = Buffer.from(
      "4aab1d6f000000000000000000000000000000000000000000000000000000000000000300000000000000000000000000000000000000000000000000000000000000a0000000000000000000000000000000000000000000000000000000000000034000000000000000000000000000000000000000000000000000000000000001180000000000000000000000000000000000000000000000000000000000000007000000000000000000000000000000000000000000000000000000000000000400000000000000000000000000000000000000000000000000000000000000800000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000018000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000041046da70321ffbaccec770ccf2cc7cf6e6c951361eda9af5784639a4254dffb15b38a586ef57baa243a3e7d16e8d5bbe271330d49ca6a741c039405dd0cf69e9efe00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000004104104b9d4842d369a51efbdd7f81cb4f6b12fc23175a2a291e6f1d0d592ebaa6beafca544f8f81c27083c60ddc40b7ee2b665fd66fb000186e447c15b917385fa50000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000410462f355d394143a1eda58ef607498f4da025628871d4b4d67ce007084497d52ad89c85a6b65a653837068c75cc3c878e5c908ea018f527e4a2d86bafce947cfca00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000004104017468acc353c8e69f42aad974d71d1bc776520b1117c4885889dd0ce11b033524d1c93373155883d775a049e997607299e186f79663c0e52046b7be5e91fca30000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000040000000000000000000000000000000000000000000000000000000000000064000000000000000000000000000000000000000000000000000000000000006400000000000000000000000000000000000000000000000000000000000000640000000000000000000000000000000000000000000000000000000000000064",
      "hex"
    );
    let initialValsetHash,
      valset,
      initialValidators,
      initialWeights,
      metadataPDAPayer,
      payloadPDAPayer,
      metadataPDA,
      payloadPDA,
      tx;

    before(async () => {
      initialValsetHash = sha256(valsetHex);
      valset = parseValSetFromHex(valsetHex);
      initialValidators = valset.pubkeys;
      initialWeights = valset.weights;

      metadataPDAPayer = PublicKey.findProgramAddressSync(
        [Buffer.from(initialValsetHash, "hex"), metadata_seed, payer.publicKey.toBuffer()],
        program.programId
      )[0];
      payloadPDAPayer = PublicKey.findProgramAddressSync(
        [Buffer.from(initialValsetHash, "hex"), payer.publicKey.toBuffer()],
        program.programId
      )[0];

      metadataPDA = PublicKey.findProgramAddressSync(
        [Buffer.from(initialValsetHash, "hex"), metadata_seed, admin.publicKey.toBuffer()],
        program.programId
      )[0];
      payloadPDA = PublicKey.findProgramAddressSync(
        [Buffer.from(initialValsetHash, "hex"), admin.publicKey.toBuffer()],
        program.programId
      )[0];
    });

    it("createMetadataForValsetPayload: anyone can create", async () => {
      let tx = await program.methods
        .createMetadataForValsetPayload(Buffer.from(initialValsetHash, "hex"))
        .accounts({
          payer: admin.publicKey,
          metadata: metadataPDA
        })
        .signers([admin])
        .rpc();
      await provider.connection.confirmTransaction(tx);
    });

    it("postMetadataForValsetPayload: successful by creator", async () => {
      const tx = await program.methods
        .postMetadataForValsetPayload(initialValidators, initialWeights)
        .accounts({
          payer: admin.publicKey,
          metadata: metadataPDA
        })
        .signers([admin])
        .rpc();
      await provider.connection.confirmTransaction(tx);
    });

    it("setInitialValset: successful by admin", async () => {
      tx = await program.methods
        .createValsetPayload(valset.epoch, valset.weightThreshold, valset.height)
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
        .setInitialValset()
        .accounts({ payer: admin.publicKey, config: configPDA, metadata: metadataPDA, payload: payloadPDA })
        .signers([admin])
        .rpc();
      await provider.connection.confirmTransaction(tx);
    });
  });
});
