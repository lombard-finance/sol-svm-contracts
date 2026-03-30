import "dotenv/config";
import * as anchor from "@coral-xyz/anchor";
import { BN, BorshCoder, EventManager, Program } from "@coral-xyz/anchor";
import {
  Ed25519Program,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  TransactionInstruction
} from "@solana/web3.js";
import * as spl from "@solana/spl-token";
import { AssetRouter } from "../target/types/asset_router";
import { sha256 } from "js-sha256";
import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import { Mailbox } from "../target/types/mailbox";
import { ethers, keccak256 } from "ethers";
import { ConsortiumUtility, PayloadDepositV1, randomNumber } from "./consortium_utilities";
import { Consortium } from "../target/types/consortium";
import { MailboxUtilities, messageV1 } from "./mailbox_utilities";
import {
  ASSETS_MODULE_ADDRESS,
  BITCOIN_LCHAIN_ID,
  BITCOIN_LCHAIN_ID_BZ,
  BITCOIN_TOKEN_ADDRESS,
  BTCSTAKING_MODULE_ADDRESS,
  BTCSTAKING_MODULE_ADDRESS_BZ,
  DepositMsg,
  FeePermit,
  fundWallet,
  LCHAIN_ID,
  LCHAIN_ID_BZ,
  LEDGER_LCHAIN_ID,
  LEDGER_LCHAIN_ID_BZ,
  LEDGER_MAILBOX_ADDRESS,
  MintMsg,
  REDEEM_SELECTOR,
  RedeemMsg
} from "./asset_router_utilities";

chai.use(chaiAsPromised);
const expect = chai.expect;

/** Pass when bascule is disabled so Anchor receives explicit nulls for optional bascule accounts. */
function withOptionalBasculeNull<T extends Record<string, unknown>>(accounts: T): T & Record<string, unknown> {
  return {
    ...accounts,
    basculeValidator: null,
    basculeProgram: null,
    basculeData: null,
    basculeDeposit: null
  };
}

declare module "@coral-xyz/anchor" {
  interface BN {
    toBigInt(): bigint;
  }
}

BN.prototype.toBigInt = function (): bigint {
  return BigInt(this.toString(10));
};

describe("Asset Router", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  // ---Programs
  const program = anchor.workspace.AssetRouter as Program<AssetRouter>;
  const programEventManager = new EventManager(program.programId, provider, new BorshCoder(program.idl));
  let configPDA: PublicKey;

  const mailbox = anchor.workspace.Mailbox as Program<Mailbox>;
  const mailboxAddress = mailbox.programId;
  let mailboxConfigPDA: PublicKey;
  let mailboxUtilities: MailboxUtilities;

  const consortium = anchor.workspace.Consortium as Program<Consortium>;
  const consortiumUtility = new ConsortiumUtility(consortium);
  consortiumUtility.generateAndAddKeypairs(3);

  const nativeMintKeypair = Keypair.fromSeed(Uint8Array.from(Array(32).fill(5)));
  const stakedMintKeypair = Keypair.fromSeed(Uint8Array.from(Array(32).fill(6)));
  let mintNativeAsBytes = Array.from(nativeMintKeypair.publicKey.toBytes());
  let mintStakedAsBytes = Array.from(stakedMintKeypair.publicKey.toBytes());

  const nativeTokenConfigPDA = PublicKey.findProgramAddressSync(
    [Buffer.from("token_config"), nativeMintKeypair.publicKey.toBuffer()],
    program.programId
  )[0];
  const stakedTokenConfigPDA = PublicKey.findProgramAddressSync(
    [Buffer.from("token_config"), stakedMintKeypair.publicKey.toBuffer()],
    program.programId
  )[0];
  const messagingAuthorityPDA = PublicKey.findProgramAddressSync(
    [Buffer.from("messaging_authority")],
    program.programId
  )[0];  const tokenAuth = PublicKey.findProgramAddressSync(
    [Buffer.from("token_authority")],
    program.programId
  )[0] as PublicKey;

  // ---Signers
  const payer: Keypair = Keypair.generate();
  const admin: Keypair = Keypair.generate();
  const operator: Keypair = Keypair.generate();
  const pauser: Keypair = Keypair.generate();
  const minter: Keypair = Keypair.generate();
  const claimer: Keypair = Keypair.generate();
  const treasury: Keypair = Keypair.generate();
  let treasuryNativeTA: PublicKey;
  let treasuryStakedTA: PublicKey;
  const staker1: Keypair = Keypair.generate();
  let staker1NativeTA: PublicKey;
  let staker1StakedTA: PublicKey;
  const staker2: Keypair = Keypair.generate();
  let staker2NativeTA: PublicKey;
  let staker2StakedTA: PublicKey;

  // ---Asset router config
  let mintFee = new BN(1);
  const stakedRedeemFee = new BN(50);
  const stakedToNativeCommission = new BN(100);
  const nativeToNativeCommission = new BN(100);
  const redeemForBtcMinAmount = new BN(1000);
  const bascule: PublicKey | null = null;
  const basculeGmp: PublicKey | null = null;
  const redeemTokenRoutePDA = PublicKey.findProgramAddressSync(
    [
      Buffer.from("token_route"),
      LCHAIN_ID,
      stakedMintKeypair.publicKey.toBuffer(),
      LCHAIN_ID,
      nativeMintKeypair.publicKey.toBuffer()
    ],
    program.programId
  )[0];
  const redeemBtcTokenRoutePDA = PublicKey.findProgramAddressSync(
    [
      Buffer.from("token_route"),
      LCHAIN_ID,
      stakedMintKeypair.publicKey.toBuffer(),
      BITCOIN_LCHAIN_ID,
      BITCOIN_TOKEN_ADDRESS
    ],
    program.programId
  )[0];
  const redeemBtcNativeTokenRoutePDA = PublicKey.findProgramAddressSync(
    [
      Buffer.from("token_route"),
      LCHAIN_ID,
      nativeMintKeypair.publicKey.toBuffer(),
      BITCOIN_LCHAIN_ID,
      BITCOIN_TOKEN_ADDRESS
    ],
    program.programId
  )[0];
  const depositTokenRoutePDA = PublicKey.findProgramAddressSync(
    [
      Buffer.from("token_route"),
      LCHAIN_ID,
      nativeMintKeypair.publicKey.toBuffer(),
      LCHAIN_ID,
      stakedMintKeypair.publicKey.toBuffer()
    ],
    program.programId
  )[0];

  before(async () => {
    await fundWallet(payer, 25);
    await fundWallet(admin, 25);
    await fundWallet(operator, 25);
    await fundWallet(pauser, 25);
    await fundWallet(minter, 25);
    await fundWallet(claimer, 25);
    await fundWallet(treasury, 25);
    await fundWallet(staker1, 25);
    await fundWallet(staker2, 25);

    await spl.createMint(provider.connection, admin, tokenAuth, admin.publicKey, 8, nativeMintKeypair);
    await spl.createMint(provider.connection, admin, tokenAuth, admin.publicKey, 8, stakedMintKeypair);

    [configPDA] = PublicKey.findProgramAddressSync([Buffer.from("asset_router_config")], program.programId);
    [mailboxConfigPDA] = PublicKey.findProgramAddressSync([Buffer.from("mailbox_config")], mailbox.programId);

    treasuryNativeTA = await spl.createAssociatedTokenAccount(
      provider.connection,
      treasury,
      nativeMintKeypair.publicKey,
      treasury.publicKey
    );
    treasuryStakedTA = await spl.createAssociatedTokenAccount(
      provider.connection,
      treasury,
      stakedMintKeypair.publicKey,
      treasury.publicKey
    );

    staker1NativeTA = await spl.createAssociatedTokenAccount(
      provider.connection,
      staker1,
      nativeMintKeypair.publicKey,
      staker1.publicKey
    );
    staker1StakedTA = await spl.createAssociatedTokenAccount(
      provider.connection,
      staker1,
      stakedMintKeypair.publicKey,
      staker1.publicKey
    );

    staker2NativeTA = await spl.createAssociatedTokenAccount(
      provider.connection,
      staker2,
      nativeMintKeypair.publicKey,
      staker2.publicKey
    );
    staker2StakedTA = await spl.createAssociatedTokenAccount(
      provider.connection,
      staker2,
      stakedMintKeypair.publicKey,
      staker2.publicKey
    );

    await consortiumUtility.initializeConsortiumProgram(admin);

    mailboxUtilities = new MailboxUtilities(consortiumUtility, LCHAIN_ID, admin, treasury.publicKey);
    await mailboxUtilities.initialize();
    // enable communication with ledger for redeem and deposit
    await mailboxUtilities.enableInboundMessagePath(LEDGER_MAILBOX_ADDRESS, LEDGER_LCHAIN_ID);
    await mailboxUtilities.enableOutboundMessagePath(LEDGER_LCHAIN_ID);
  });

  describe("Initialize", function () {
    it("initialize: fails when payer is not deployer", async () => {
      await expect(
        program.methods
          .initialize({
            admin: provider.wallet.publicKey,
            pendingAdmin: new PublicKey(0), // these are ignored
            treasury: treasury.publicKey,
            paused: false,
            nativeMint: nativeMintKeypair.publicKey,
            consortium: consortium.programId,
            mailbox: mailboxAddress,
            bascule: bascule,
            basculeGmp: basculeGmp,
            ledgerLchainId: LEDGER_LCHAIN_ID_BZ,
            bitcoinLchainId: BITCOIN_LCHAIN_ID_BZ
          })
          .accounts({
            deployer: payer.publicKey
          })
          .signers([payer])
          .rpc()
      ).to.be.rejectedWith("ConstraintRaw");
    });

    it("initialize: successful", async () => {
      await program.methods
        .initialize({
          admin: provider.wallet.publicKey,
          pendingAdmin: new PublicKey(0), // these are ignored
          treasury: treasury.publicKey,
          paused: false,
          nativeMint: nativeMintKeypair.publicKey,
          consortium: consortium.programId,
          mailbox: mailboxAddress,
          bascule: bascule,
          basculeGmp: basculeGmp,
          ledgerLchainId: LEDGER_LCHAIN_ID_BZ,
          bitcoinLchainId: BITCOIN_LCHAIN_ID_BZ
        })
        .accounts({
          deployer: provider.wallet.publicKey
        })
        .signers([Keypair.fromSecretKey(provider.wallet.payer.secretKey)])
        .rpc({ commitment: "confirmed" });

      const cfg = await program.account.config.fetch(configPDA);
      expect(cfg.admin.toBase58()).to.be.eq(provider.wallet.publicKey.toBase58());
      expect(cfg.paused).to.be.eq(false);
      expect(cfg.nativeMint.toBase58()).to.be.eq(nativeMintKeypair.publicKey.toBase58());
      expect(cfg.treasury.toBase58()).to.be.eq(treasury.publicKey.toBase58());
      expect(cfg.mailbox.toBase58()).to.be.eq(mailboxAddress.toBase58());
      expect(cfg.bascule).to.be.null;
      expect(cfg.basculeGmp).to.be.null;
      expect(cfg.ledgerLchainId).to.be.deep.eq(LEDGER_LCHAIN_ID_BZ);
      expect(cfg.bitcoinLchainId).to.be.deep.eq(BITCOIN_LCHAIN_ID_BZ);
    });

    /*    it("changeMintAuth: successful when called by admin", async () => {
          await program.methods
            .changeMintAuth(payer.publicKey)
            .accounts({
              payer: admin.publicKey,
              config: configPDA,
              mint,
              currentAuth: tokenAuth,
              tokenProgram: spl.TOKEN_PROGRAM_ID,
              tokenAuthority: tokenAuth
            })
            .signers([admin])
            .rpc({commitment: "confirmed"});

          const info = await spl.getMint(provider.connection, mint);
          expect(info.mintAuthority.toBase58()).to.be.equal(payer.publicKey.toBase58());

          // Revert to tokenauth to facilitate further testing
          const tx2 = await spl.setAuthority(
            provider.connection,
            payer,
            mint,
            payer,
            spl.AuthorityType.MintTokens,
            tokenAuth
          );
          await provider.connection.confirmTransaction(tx2);
          const info2 = await spl.getMint(provider.connection, mint);
          expect(info2.mintAuthority.toBase58()).to.be.equal(tokenAuth.toBase58());
        });*/
  });

  describe("Ownership", function () {
    it("transferOwnership: failure from unauthorized party", async () => {
      await expect(
        program.methods.transferOwnership(admin.publicKey).accounts({ payer: admin.publicKey }).signers([admin]).rpc()
      ).to.be.rejectedWith("Unauthorized");
    });

    it("transferOwnership: successful by admin", async () => {
      await program.methods
        .transferOwnership(admin.publicKey)
        .accounts({ payer: provider.wallet.publicKey })
        .signers([Keypair.fromSecretKey(provider.wallet.payer.secretKey)])
        .rpc({ commitment: "confirmed" });

      const cfg = await program.account.config.fetch(configPDA);
      expect(cfg.admin.toBase58()).to.be.equal(provider.wallet.publicKey.toBase58());
      expect(cfg.pendingAdmin.toBase58()).to.be.equal(admin.publicKey.toBase58());
    });

    it("acceptOwnership: failure from unauthorized party", async () => {
      await expect(
        program.methods
          .acceptOwnership()
          .accounts({ payer: provider.wallet.publicKey })
          .signers([Keypair.fromSecretKey(provider.wallet.payer.secretKey)])
          .rpc()
      ).to.be.rejectedWith("ConstraintAddress");
    });

    it("acceptOwnership: successful by pending admin", async () => {
      await program.methods
        .acceptOwnership()
        .accounts({ payer: admin.publicKey })
        .signers([admin])
        .rpc({ commitment: "confirmed" });

      const cfg = await program.account.config.fetch(configPDA);
      expect(cfg.admin.toBase58()).to.be.equal(admin.publicKey.toBase58());
      expect(cfg.pendingAdmin.toBase58()).to.be.equal(SystemProgram.programId.toBase58());
    });
  });

  describe("Token Config", function () {
    const TokenConfigEvents = [];
    const listeners: number[] = [];

    before(async function () {
      listeners.push(
        programEventManager.addEventListener("tokenConfigSet", e => {
          console.log(JSON.stringify(e));
          TokenConfigEvents.push(e);
        })
      );
    });

    afterEach(async function () {
      TokenConfigEvents.length = 0;
    });

    after(async function () {
      for (const l of listeners) {
        await programEventManager.removeEventListener(l);
      }
    });

    it("setTokenConfig: successful by admin (native mint)", async () => {
      const config = {
        redeemFee: stakedRedeemFee,
        redeemForBtcMinAmount: redeemForBtcMinAmount,
        maxMintCommission: mintFee,
        toNativeCommission: nativeToNativeCommission,
        ledgerRedeemHandler: ASSETS_MODULE_ADDRESS
      };
      await program.methods
        .setTokenConfig(nativeMintKeypair.publicKey, config)
        .accounts({
          payer: admin.publicKey
        })
        .signers([admin])
        .rpc({ commitment: "confirmed" });

      const tokenConfig = await program.account.tokenConfig.fetch(nativeTokenConfigPDA);
      expect(tokenConfig.redeemFee.eq(config.redeemFee));
      expect(tokenConfig.redeemForBtcMinAmount.eq(config.redeemForBtcMinAmount));
      expect(tokenConfig.maxMintCommission.eq(config.maxMintCommission));
      expect(tokenConfig.toNativeCommission.eq(config.toNativeCommission));
      expect(tokenConfig.ledgerRedeemHandler).to.be.deep.eq(config.ledgerRedeemHandler);

      //event
      expect(TokenConfigEvents[0]).to.be.not.undefined;
      expect(TokenConfigEvents[0].config.redeemFee.eq(config.redeemFee));
      expect(TokenConfigEvents[0].config.redeemForBtcMinAmount.eq(config.redeemForBtcMinAmount));
      expect(TokenConfigEvents[0].config.maxMintCommission.eq(config.maxMintCommission));
      expect(TokenConfigEvents[0].config.toNativeCommission.eq(config.toNativeCommission));
      expect(TokenConfigEvents[0].config.ledgerRedeemHandler).to.be.deep.eq(config.ledgerRedeemHandler);
    });

    it("setTokenConfig: successful update", async () => {
      const config = {
        redeemFee: stakedRedeemFee,
        redeemForBtcMinAmount: redeemForBtcMinAmount,
        maxMintCommission: new BN(300),
        toNativeCommission: nativeToNativeCommission,
        ledgerRedeemHandler: ASSETS_MODULE_ADDRESS
      };
      await program.methods
        .setTokenConfig(nativeMintKeypair.publicKey, config)
        .accounts({
          payer: admin.publicKey
        })
        .signers([admin])
        .rpc({ commitment: "confirmed" });

      const tokenConfig = await program.account.tokenConfig.fetch(nativeTokenConfigPDA);
      expect(tokenConfig.redeemFee.eq(config.redeemFee));
      expect(tokenConfig.redeemForBtcMinAmount.eq(config.redeemForBtcMinAmount));
      expect(tokenConfig.maxMintCommission.eq(config.maxMintCommission));
      expect(tokenConfig.toNativeCommission.eq(config.toNativeCommission));
      expect(tokenConfig.ledgerRedeemHandler).to.be.deep.eq(config.ledgerRedeemHandler);
    });

    it("setTokenConfig: rejects when called by not admin", async () => {
      const config = {
        redeemFee: stakedRedeemFee,
        redeemForBtcMinAmount: redeemForBtcMinAmount,
        maxMintCommission: mintFee,
        toNativeCommission: nativeToNativeCommission,
        ledgerRedeemHandler: ASSETS_MODULE_ADDRESS
      };
      await expect(
        program.methods
          .setTokenConfig(nativeMintKeypair.publicKey, config)
          .accounts({
            payer: staker1.publicKey
          })
          .signers([staker1])
          .rpc()
      ).to.be.rejectedWith("Unauthorized");
    });

    it("setTokenConfig: successful by admin (staked mint)", async () => {
      const config = {
        redeemFee: stakedRedeemFee,
        redeemForBtcMinAmount: redeemForBtcMinAmount,
        maxMintCommission: mintFee,
        toNativeCommission: stakedToNativeCommission,
        ledgerRedeemHandler: BTCSTAKING_MODULE_ADDRESS_BZ
      };
      await program.methods
        .setTokenConfig(stakedMintKeypair.publicKey, config)
        .accounts({
          payer: admin.publicKey
        })
        .signers([admin])
        .rpc({ commitment: "confirmed" });

      const tokenConfig = await program.account.tokenConfig.fetch(stakedTokenConfigPDA);
      expect(tokenConfig.redeemFee.eq(config.redeemFee));
      expect(tokenConfig.redeemForBtcMinAmount.eq(config.redeemForBtcMinAmount));
      expect(tokenConfig.maxMintCommission.eq(new BN(config.maxMintCommission.toString())));
      expect(tokenConfig.toNativeCommission.eq(config.toNativeCommission));
      expect(tokenConfig.ledgerRedeemHandler).to.be.deep.eq(config.ledgerRedeemHandler);

      //event
      expect(TokenConfigEvents[0]).to.be.not.undefined;
      expect(TokenConfigEvents[0].config.redeemFee.eq(config.redeemFee));
      expect(TokenConfigEvents[0].config.redeemForBtcMinAmount.eq(config.redeemForBtcMinAmount));
      expect(TokenConfigEvents[0].config.maxMintCommission.eq(config.maxMintCommission));
      expect(TokenConfigEvents[0].config.toNativeCommission.eq(config.toNativeCommission));
      expect(TokenConfigEvents[0].config.ledgerRedeemHandler).to.be.deep.eq(config.ledgerRedeemHandler);
    });
  });

  describe("Token Route", function () {
    const TokenRouteSetEvents = [];
    const TokenRouteRemovedEvents = [];
    const listeners: number[] = [];

    before(async function () {
      listeners.push(
        programEventManager.addEventListener("tokenRouteSet", e => {
          console.log(JSON.stringify(e));
          TokenRouteSetEvents.push(e);
        })
      );
      listeners.push(
        programEventManager.addEventListener("tokenRouteUnset", e => {
          console.log(JSON.stringify(e));
          TokenRouteRemovedEvents.push(e);
        })
      );
    });

    afterEach(async function () {
      TokenRouteSetEvents.length = 0;
      TokenRouteRemovedEvents.length = 0;
    });

    after(async function () {
      for (const l of listeners) {
        await programEventManager.removeEventListener(l);
      }
    });

    it("setTokenRoute: successful by admin to redeem staked to self chain", async () => {
      await program.methods
        .setTokenRoute(LCHAIN_ID_BZ, mintStakedAsBytes, LCHAIN_ID_BZ, mintNativeAsBytes, { redeem: {} })
        .accounts({
          payer: admin.publicKey
        })
        .signers([admin])
        .rpc({ commitment: "confirmed" });

      const tokenRoute = await program.account.tokenRoute.fetch(redeemTokenRoutePDA);
      expect(tokenRoute.routeType).to.be.deep.equal({ redeem: {} });

      expect(TokenRouteSetEvents[0]).to.be.not.undefined;
      expect(TokenRouteSetEvents[0].fromChainId).to.be.deep.eq(LCHAIN_ID_BZ);
      expect(TokenRouteSetEvents[0].fromTokenAddress).to.be.deep.eq(mintStakedAsBytes);
      expect(TokenRouteSetEvents[0].toChainId).to.be.deep.eq(LCHAIN_ID_BZ);
      expect(TokenRouteSetEvents[0].toTokenAddress).to.be.deep.eq(mintNativeAsBytes);
      expect(TokenRouteSetEvents[0].tokenRouteType).to.be.deep.eq({ redeem: {} });
    });

    it("setTokenRoute: successful by admin to deposit to self chain", async () => {
      await program.methods
        .setTokenRoute(LCHAIN_ID_BZ, mintNativeAsBytes, LCHAIN_ID_BZ, mintStakedAsBytes, { deposit: {} })
        .accounts({
          payer: admin.publicKey
        })
        .signers([admin])
        .rpc({ commitment: "confirmed" });

      const tokenRoute = await program.account.tokenRoute.fetch(depositTokenRoutePDA);
      expect(tokenRoute.routeType).to.be.deep.equal({ deposit: {} });

      expect(TokenRouteSetEvents[0]).to.be.not.undefined;
      expect(TokenRouteSetEvents[0].fromChainId).to.be.deep.eq(LCHAIN_ID_BZ);
      expect(TokenRouteSetEvents[0].fromTokenAddress).to.be.deep.eq(mintNativeAsBytes);
      expect(TokenRouteSetEvents[0].toChainId).to.be.deep.eq(LCHAIN_ID_BZ);
      expect(TokenRouteSetEvents[0].toTokenAddress).to.be.deep.eq(mintStakedAsBytes);
      expect(TokenRouteSetEvents[0].tokenRouteType).to.be.deep.eq({ deposit: {} });
    });

    it("setTokenRoute: successful by admin to redeem staked for Bitcoin", async () => {
      await program.methods
        .setTokenRoute(
          LCHAIN_ID_BZ,
          mintStakedAsBytes,
          BITCOIN_LCHAIN_ID_BZ,
          Array.from(Uint8Array.from(BITCOIN_TOKEN_ADDRESS)),
          { redeem: {} }
        )
        .accounts({
          payer: admin.publicKey
        })
        .signers([admin])
        .rpc({ commitment: "confirmed" });

      const tokenRoute = await program.account.tokenRoute.fetch(redeemBtcTokenRoutePDA);
      expect(tokenRoute.routeType).to.be.deep.equal({ redeem: {} });

      expect(TokenRouteSetEvents[0]).to.be.not.undefined;
      expect(TokenRouteSetEvents[0].fromChainId).to.be.deep.eq(LCHAIN_ID_BZ);
      expect(TokenRouteSetEvents[0].fromTokenAddress).to.be.deep.eq(mintStakedAsBytes);
      expect(TokenRouteSetEvents[0].toChainId).to.be.deep.eq(BITCOIN_LCHAIN_ID_BZ);
      expect(TokenRouteSetEvents[0].toTokenAddress).to.be.deep.eq(
        Array.from(Uint8Array.from(BITCOIN_TOKEN_ADDRESS))
      );
      expect(TokenRouteSetEvents[0].tokenRouteType).to.be.deep.eq({ redeem: {} });
    });

    it("setTokenRoute: successful by admin to redeem native for Bitcoin", async () => {
      await program.methods
        .setTokenRoute(
          LCHAIN_ID_BZ,
          mintNativeAsBytes,
          BITCOIN_LCHAIN_ID_BZ,
          Array.from(Uint8Array.from(BITCOIN_TOKEN_ADDRESS)),
          { redeem: {} }
        )
        .accounts({
          payer: admin.publicKey
        })
        .signers([admin])
        .rpc({ commitment: "confirmed" });

      const tokenRoute = await program.account.tokenRoute.fetch(redeemBtcNativeTokenRoutePDA);
      expect(tokenRoute.routeType).to.be.deep.equal({ redeem: {} });

      expect(TokenRouteSetEvents[0]).to.be.not.undefined;
      expect(TokenRouteSetEvents[0].fromChainId).to.be.deep.eq(LCHAIN_ID_BZ);
      expect(TokenRouteSetEvents[0].fromTokenAddress).to.be.deep.eq(mintNativeAsBytes);
      expect(TokenRouteSetEvents[0].toChainId).to.be.deep.eq(BITCOIN_LCHAIN_ID_BZ);
      expect(TokenRouteSetEvents[0].toTokenAddress).to.be.deep.eq(
        Array.from(Uint8Array.from(BITCOIN_TOKEN_ADDRESS))
      );
      expect(TokenRouteSetEvents[0].tokenRouteType).to.be.deep.eq({ redeem: {} });
    });

    it("unsetTokenRoute rejects when called by not admin", async function () {
      await expect(
        program.methods
          .unsetTokenRoute(
            LCHAIN_ID_BZ,
            mintNativeAsBytes,
            BITCOIN_LCHAIN_ID_BZ,
            Array.from(Uint8Array.from(BITCOIN_TOKEN_ADDRESS))
          )
          .accounts({
            payer: payer.publicKey
          })
          .signers([payer])
          .rpc()
      ).to.be.rejectedWith("Unauthorized");
    });

    it("unsetTokenRoute: successful by admin", async function () {
      await program.methods
        .unsetTokenRoute(
          LCHAIN_ID_BZ,
          mintNativeAsBytes,
          BITCOIN_LCHAIN_ID_BZ,
          Array.from(Uint8Array.from(BITCOIN_TOKEN_ADDRESS))
        )
        .accounts({
          payer: admin.publicKey
        })
        .signers([admin])
        .rpc({ commitment: "confirmed" });

      expect(TokenRouteRemovedEvents[0]).to.be.not.undefined;
      expect(TokenRouteRemovedEvents[0].fromChainId).to.be.deep.eq(LCHAIN_ID_BZ);
      expect(TokenRouteRemovedEvents[0].fromTokenAddress).to.be.deep.eq(mintNativeAsBytes);
      expect(TokenRouteRemovedEvents[0].toChainId).to.be.deep.eq(BITCOIN_LCHAIN_ID_BZ);
      expect(TokenRouteRemovedEvents[0].toTokenAddress).to.be.deep.eq(
        Array.from(Uint8Array.from(BITCOIN_TOKEN_ADDRESS))
      );
      expect(TokenRouteRemovedEvents[0].tokenRouteType).to.be.deep.eq({ redeem: {} });

      expect(await provider.connection.getAccountInfo(redeemBtcNativeTokenRoutePDA)).to.be.null;
    });

    it("setTokenRoute rejects when called by not admin", async function () {
      await expect(
        program.methods
          .setTokenRoute(
            LCHAIN_ID_BZ,
            mintNativeAsBytes,
            BITCOIN_LCHAIN_ID_BZ,
            Array.from(Uint8Array.from(BITCOIN_TOKEN_ADDRESS)),
            { redeem: {} }
          )
          .accounts({
            payer: payer.publicKey
          })
          .signers([payer])
          .rpc()
      ).to.be.rejectedWith("Unauthorized");
    });

    it("setTokenRoute: rejects when non of the chains is solana", async () => {
      await expect(
        program.methods
          .setTokenRoute(
            BITCOIN_LCHAIN_ID_BZ,
            mintNativeAsBytes,
            BITCOIN_LCHAIN_ID_BZ,
            Array.from(Uint8Array.from(BITCOIN_TOKEN_ADDRESS)),
            { redeem: {} }
          )
          .accounts({
            payer: admin.publicKey
          })
          .signers([admin])
          .rpc()
      ).to.be.rejectedWith("InvalidChainID");
    });

    it("setTokenRoute again after unset", async () => {
      await program.methods
        .setTokenRoute(
          LCHAIN_ID_BZ,
          mintNativeAsBytes,
          BITCOIN_LCHAIN_ID_BZ,
          Array.from(Uint8Array.from(BITCOIN_TOKEN_ADDRESS)),
          { redeem: {} }
        )
        .accounts({
          payer: admin.publicKey
        })
        .signers([admin])
        .rpc({ commitment: "confirmed" });

      const tokenRoute = await program.account.tokenRoute.fetch(redeemBtcNativeTokenRoutePDA);
      expect(tokenRoute.routeType).to.be.deep.equal({ redeem: {} });

      expect(TokenRouteSetEvents[0]).to.be.not.undefined;
      expect(TokenRouteSetEvents[0].fromChainId).to.be.deep.eq(LCHAIN_ID_BZ);
      expect(TokenRouteSetEvents[0].fromTokenAddress).to.be.deep.eq(mintNativeAsBytes);
      expect(TokenRouteSetEvents[0].toChainId).to.be.deep.eq(BITCOIN_LCHAIN_ID_BZ);
      expect(TokenRouteSetEvents[0].toTokenAddress).to.be.deep.eq(
        Array.from(Uint8Array.from(BITCOIN_TOKEN_ADDRESS))
      );
      expect(TokenRouteSetEvents[0].tokenRouteType).to.be.deep.eq({ redeem: {} });
    });
  });

  describe("Bascule integration config", function () {
    it("setBascule rejects when called by not admin", async () => {
      await expect(
        (program.methods as any)
          .setBascule(mailboxAddress) // any pubkey
          .accounts({ payer: pauser.publicKey })
          .signers([pauser])
          .rpc()
      ).to.be.rejectedWith("Unauthorized");
    });

    it("setBascule successful by admin", async () => {
      await (program.methods as any)
        .setBascule(mailboxAddress) // any pubkey
        .accounts({ payer: admin.publicKey })
        .signers([admin])
        .rpc({ commitment: "confirmed" });

      const cfg = await program.account.config.fetch(configPDA);
      expect(cfg.bascule?.toBase58()).to.eq(mailboxAddress.toBase58());
    });

    it("setBasculeGmp successful by admin", async () => {
      await (program.methods as any)
        .setBasculeGmp(mailboxAddress) // any pubkey
        .accounts({ payer: admin.publicKey })
        .signers([admin])
        .rpc({ commitment: "confirmed" });

      const cfg = await program.account.config.fetch(configPDA);
      expect(cfg.basculeGmp?.toBase58()).to.eq(mailboxAddress.toBase58());
    });

    it("can clear bascule and basculeGmp", async () => {
      await (program.methods as any)
        .setBascule(null)
        .accounts({ payer: admin.publicKey })
        .signers([admin])
        .rpc({ commitment: "confirmed" });
      await (program.methods as any)
        .setBasculeGmp(null)
        .accounts({ payer: admin.publicKey })
        .signers([admin])
        .rpc({ commitment: "confirmed" });

      const cfg = await program.account.config.fetch(configPDA);
      expect(cfg.bascule).to.be.null;
      expect(cfg.basculeGmp).to.be.null;
    });
  });

  describe("Treasury", function () {
    const TreasuryEvents = [];
    const listeners: number[] = [];

    before(async function () {
      listeners.push(
        programEventManager.addEventListener("treasuryChanged", e => {
          console.log(JSON.stringify(e));
          TreasuryEvents.push(e);
        })
      );
    });

    afterEach(async function () {
      TreasuryEvents.length = 0;
    });

    after(async function () {
      for (const l of listeners) {
        await programEventManager.removeEventListener(l);
      }
    });

    it("setTreasury rejects when called by not admin", async () => {
      await expect(
        program.methods.setTreasury(staker1.publicKey).accounts({ payer: staker1.publicKey }).signers([staker1]).rpc()
      ).to.be.rejectedWith("ConstraintAddress");
    });

    it("setTreasury successful by admin", async () => {
      await program.methods
        .setTreasury(treasury.publicKey)
        .accounts({ payer: admin.publicKey })
        .signers([admin])
        .rpc({ commitment: "confirmed" });

      expect(TreasuryEvents[0]).to.be.not.undefined;
      expect(TreasuryEvents[0].address).to.be.deep.eq(treasury.publicKey);
    });
  });

  describe("Account Roles", function () {
    const RoleGrants = [];
    const RoleRevokes = [];
    const listeners: number[] = [];

    before(async function () {
      listeners.push(
        programEventManager.addEventListener("accountRoleGranted", e => {
          console.log(JSON.stringify(e));
          RoleGrants.push(e);
        })
      );
      listeners.push(
        programEventManager.addEventListener("accountRolesRevoked", e => {
          console.log(JSON.stringify(e));
          RoleRevokes.push(e);
        })
      );
    });

    afterEach(async function () {
      RoleGrants.length = 0;
      RoleRevokes.length = 0;
    });

    after(async function () {
      for (const l of listeners) {
        await programEventManager.removeEventListener(l);
      }
    });

    it("grantAccountRole: successful by admin", async () => {
      await program.methods
        .grantAccountRole(claimer.publicKey, { claimer: {} })
        .accounts({ admin: admin.publicKey })
        .signers([admin])
        .rpc({ commitment: "confirmed" });

      expect(RoleGrants[0]).to.be.not.undefined;
      expect(RoleGrants[0].account.toBase58()).to.be.eq(claimer.publicKey.toBase58());
      expect(RoleGrants[0].accountRole).to.be.deep.eq({ claimer: {} });
    });

    it("grantAccountRole: rejects when role is already granted", async () => {
      await expect(
        program.methods
          .grantAccountRole(claimer.publicKey, { claimer: {} })
          .accounts({ admin: admin.publicKey })
          .signers([admin])
          .rpc()
      ).to.be.rejectedWith("AccountRoleAlreadyGranted");
    });

    it("grantAccountRole: rejects when called by not admin", async () => {
      await expect(
        program.methods
          .grantAccountRole(staker1.publicKey, { claimer: {} })
          .accounts({ admin: claimer.publicKey })
          .signers([claimer])
          .rpc()
      ).to.be.rejectedWith("Unauthorized");
    });

    it("revokeAccountRoles: rejects when called by not admin", async () => {
      await expect(
        program.methods
          .revokeAccountRoles(claimer.publicKey)
          .accounts({ admin: claimer.publicKey })
          .signers([claimer])
          .rpc()
      ).to.be.rejectedWith("Unauthorized");
    });

    it("revokeAccountRoles: successful by admin", async () => {
      await program.methods
        .revokeAccountRoles(claimer.publicKey)
        .accounts({ admin: admin.publicKey })
        .signers([admin])
        .rpc({ commitment: "confirmed" });

      expect(RoleRevokes[0]).to.be.not.undefined;
      expect(RoleRevokes[0].account.toBase58()).to.be.eq(claimer.publicKey.toBase58());
    });
  });

  describe("Pause", function () {
    const PauseEvents = [];
    const listeners: number[] = [];

    before(async function () {
      listeners.push(
        programEventManager.addEventListener("programPaused", e => {
          console.log(JSON.stringify(e));
          PauseEvents.push(e);
        })
      );
    });

    afterEach(async function () {
      PauseEvents.length = 0;
    });

    after(async function () {
      for (const l of listeners) {
        await programEventManager.removeEventListener(l);
      }
    });

    it("Grant pauser role: successful by admin", async () => {
      await program.methods
        .grantAccountRole(pauser.publicKey, { pauser: {} })
        .accounts({ admin: admin.publicKey })
        .signers([admin])
        .rpc({ commitment: "confirmed" });
    });

    it("Pause rejects when called by not pauser", async () => {
      await expect(
        program.methods.pause().accounts({ payer: payer.publicKey }).signers([payer]).rpc()
      ).to.be.rejectedWith("AccountNotInitialized");
    });

    it("Pauser can set on pause", async () => {
      await program.methods
        .pause()
        .accounts({ payer: pauser.publicKey })
        .signers([pauser])
        .rpc({ commitment: "confirmed" });

      expect(PauseEvents[0]).to.be.not.undefined;
      expect(PauseEvents[0].paused).to.be.true;
    });

    it("Pause rejects when contract is already paused", async () => {
      await expect(
        program.methods.pause().accounts({ payer: pauser.publicKey }).signers([pauser]).rpc()
      ).to.be.rejectedWith("Paused");
    });

    //Mint
    it("Mint from payload gets rejected when contract is on pause", async () => {
      const payload = new PayloadDepositV1(
        LCHAIN_ID,
        staker1NativeTA,
        100000n,
        Buffer.from(sha256("txid"), "hex"),
        randomNumber(6),
        nativeMintKeypair.publicKey
      );
      const { validatedPayloadPDA } = await consortiumUtility.createAndFinalizeSession(payer, payload.toBuffer());
      const depositPayloadSpentPDA = PublicKey.findProgramAddressSync(
        [Buffer.from("deposit_payload_spent"), payload.toHash()],
        program.programId
      )[0];

      await expect(
        program.methods
          .mintFromPayload(payload.toBytes(), payload.toHashBytes())
          .accounts(
            withOptionalBasculeNull({
              payer: payer.publicKey,
              recipient: staker1NativeTA,
              mint: nativeMintKeypair.publicKey,
              mintAuthority: tokenAuth,
              tokenProgram: spl.TOKEN_PROGRAM_ID,
              consortiumValidatedPayload: validatedPayloadPDA,
              depositPayloadSpent: depositPayloadSpentPDA
            })
          )
          .signers([payer])
          .rpc()
      ).to.be.rejectedWith("Paused");
    });

    it("Deposit native to staked gets rejected when contract is on pause", async () => {
      const amount = BigInt(100000);

      await expect(
        program.methods
          .deposit(
            LCHAIN_ID_BZ,
            mintStakedAsBytes,
            Array.from(Uint8Array.from(staker1StakedTA.toBuffer())),
            new BN(amount.toString())
          )
          .accounts({
            payer: staker1.publicKey,
            payerTokenAccount: staker1NativeTA,
            tokenProgram: spl.TOKEN_PROGRAM_ID,
            mint: nativeMintKeypair.publicKey,
            mailboxConfig: MailboxUtilities.getMailboxConfigPDA(),
            outboundMessagePath: mailboxUtilities.getOutboundMessagePathPDA(LEDGER_LCHAIN_ID),
            outboundMessage: await MailboxUtilities.getCurrentOutboundMessagePDA(),
            senderConfig: mailboxUtilities.getSenderConfigPDA(staker1.publicKey),
            treasury: null
          })
          .signers([staker1])
          .rpc()
      ).to.be.rejectedWith("Paused");
    });

    //Asset router pause does not stop message delivery

    it("Redeem for NativeBTC gets rejected when contract is on pause", async () => {
      const recipientBz = Array.from(Uint8Array.from(payer.publicKey.toBuffer()));
      const amount = BigInt(100000);

      await expect(
        program.methods
          .redeem(LCHAIN_ID_BZ, mintNativeAsBytes, recipientBz, new BN(amount.toString()))
          .accounts({
            payer: staker1.publicKey,
            payerTokenAccount: staker1StakedTA,
            tokenProgram: spl.TOKEN_PROGRAM_ID,
            mint: stakedMintKeypair.publicKey,
            treasuryTokenAccount: treasuryStakedTA,
            mailboxConfig: MailboxUtilities.getMailboxConfigPDA(),
            outboundMessagePath: mailboxUtilities.getOutboundMessagePathPDA(LEDGER_LCHAIN_ID),
            outboundMessage: await MailboxUtilities.getCurrentOutboundMessagePDA(),
            senderConfig: mailboxUtilities.getSenderConfigPDA(staker1.publicKey),
            treasury: null
          })
          .signers([staker1])
          .rpc()
      ).to.be.rejectedWith("Paused");
    });

    it("Redeem for BTC gets rejected when contract is on pause", async () => {
      const scriptPubkey = Buffer.from("5120e4ac542bbca2e12bc615744b8f755b30d9e345a2fc8622704031e2e6cdfc2f8e", "hex");
      const amount = BigInt(100000);

      await expect(
        program.methods
          .redeemForBtc(scriptPubkey, new BN(amount.toString()))
          .accounts({
            payer: staker1.publicKey,
            tokenRoute: redeemBtcTokenRoutePDA,
            payerTokenAccount: staker1StakedTA,
            tokenProgram: spl.TOKEN_PROGRAM_ID,
            mint: stakedMintKeypair.publicKey,
            treasuryTokenAccount: treasuryStakedTA,
            mailboxConfig: MailboxUtilities.getMailboxConfigPDA(),
            outboundMessagePath: mailboxUtilities.getOutboundMessagePathPDA(LEDGER_LCHAIN_ID),
            outboundMessage: await MailboxUtilities.getCurrentOutboundMessagePDA(),
            senderConfig: mailboxUtilities.getSenderConfigPDA(staker1.publicKey),
            treasury: null
          })
          .signers([staker1])
          .rpc()
      ).to.be.rejectedWith("Paused");
    });

    it("Pauser can not disable pause", async () => {
      await expect(
        program.methods.unpause().accounts({ payer: pauser.publicKey }).signers([pauser]).rpc()
      ).to.be.rejectedWith("Unauthorized");
    });

    it("Admin can disable pause", async () => {
      await program.methods
        .unpause()
        .accounts({ payer: admin.publicKey })
        .signers([admin])
        .rpc({ commitment: "confirmed" });

      expect(PauseEvents[0]).to.be.not.undefined;
      expect(PauseEvents[0].paused).to.be.false;
    });
  });

  describe("Set mint fees", function () {
    const FeeChanges = [];
    const listeners: number[] = [];

    before(async function () {
      listeners.push(
        programEventManager.addEventListener("mintFeeSet", e => {
          console.log(JSON.stringify(e));
          FeeChanges.push(e);
        })
      );

      await program.methods
        .grantAccountRole(operator.publicKey, { operator: {} })
        .accounts({
          admin: admin.publicKey
        })
        .signers([admin])
        .rpc({ commitment: "confirmed" });
    });

    afterEach(async function () {
      FeeChanges.length = 0;
    });

    after(async function () {
      for (const l of listeners) {
        await programEventManager.removeEventListener(l);
      }
    });

    it("setMintFee successful for native by operator", async () => {
      mintFee = new BN(randomNumber(3));

      await program.methods
        .setMintFee(mintFee)
        .accounts({
          operator: operator.publicKey,
          tokenConfig: nativeTokenConfigPDA
        })
        .signers([operator])
        .rpc({ commitment: "confirmed" });

      const tokenConfig = await program.account.tokenConfig.fetch(nativeTokenConfigPDA);
      expect(tokenConfig.maxMintCommission.toBigInt()).to.be.eq(mintFee.toBigInt());

      expect(FeeChanges[0]).to.be.not.undefined;
      expect(FeeChanges[0].mintFee.toBigInt()).to.be.eq(mintFee.toBigInt());
    });

    it("setMintFee rejects when fee > MAX_FEE", async () => {
      await expect(
        program.methods
          .setMintFee(new BN(100001))
          .accounts({
            operator: operator.publicKey,
            tokenConfig: nativeTokenConfigPDA
          })
          .signers([operator])
          .rpc()
      ).to.be.rejectedWith("FeeTooHigh");
    });

    it("setMintFee rejects when called not by operator", async () => {
      await expect(
        program.methods
          .setMintFee(new BN(randomNumber(3)))
          .accounts({
            operator: admin.publicKey,
            tokenConfig: nativeTokenConfigPDA
          })
          .signers([admin])
          .rpc()
      ).to.be.rejectedWith("AccountNotInitialized");
    });
  });

  //Only native token can be minted from payload
  describe("Mint native from Payload", function () {
    const MintEvents = [];
    const listeners: number[] = [];

    let feePermit: FeePermit;
    let feePayload: number[];
    let feeSignature: Uint8Array;
    let ed25519Instruction: TransactionInstruction;
    let validNativeMintPayload: PayloadDepositV1;
    let depositPayloadSpentPDA: PublicKey;
    let sessionPayloadPDA: PublicKey;

    async function postSessionPayload(poster: Keypair, payload: Buffer): Promise<PublicKey> {
      const payloadHash = Buffer.from(sha256.array(payload));
      const pda = PublicKey.findProgramAddressSync(
        [Buffer.from("session_payload"), poster.publicKey.toBuffer(), payloadHash],
        consortium.programId
      )[0];
      await consortium.methods
        .postSessionPayload(Array.from(Uint8Array.from(payloadHash)), payload, payload.length)
        .accounts({
          payer: poster.publicKey,
          sessionPayload: pda
        })
        .signers([poster])
        .rpc({ commitment: "confirmed" });
      return pda;
    }

    before(async () => {
      listeners.push(
        programEventManager.addEventListener("mintProofConsumed", e => {
          console.log(JSON.stringify(e));
          MintEvents.push(e);
        })
      );

      //Grand claimer role
      await program.methods
        .grantAccountRole(claimer.publicKey, { claimer: {} })
        .accounts({
          admin: admin.publicKey
        })
        .signers([admin])
        .rpc({ commitment: "confirmed" });

      validNativeMintPayload = new PayloadDepositV1(
        LCHAIN_ID,
        staker1NativeTA,
        100000n,
        Buffer.from(sha256("txid"), "hex"),
        0,
        nativeMintKeypair.publicKey
      );
      await consortiumUtility.createAndFinalizeSession(payer, validNativeMintPayload.toBuffer());
      sessionPayloadPDA = await postSessionPayload(payer, validNativeMintPayload.toBuffer());
      depositPayloadSpentPDA = PublicKey.findProgramAddressSync(
        [Buffer.from("deposit_payload_spent"), validNativeMintPayload.toHash()],
        program.programId
      )[0];

      feePermit = new FeePermit(program.programId, LCHAIN_ID, 200, Math.floor(Date.now() / 1000) + 30);
      feePayload = Array.from(feePermit.bytes());
      feeSignature = feePermit.signature(staker1.secretKey);
      ed25519Instruction = Ed25519Program.createInstructionWithPublicKey({
        publicKey: staker1.publicKey.toBytes(),
        message: feePermit.bytes(),
        signature: feeSignature
      });
    });

    afterEach(async function () {
      MintEvents.length = 0;
    });

    after(async function () {
      for (const l of listeners) {
        await programEventManager.removeEventListener(l);
      }
    });

    // When session is not finalized there is no validatedPayloadPDA to mint
    // When there is not enough signatures session can not be finalized: NotEnoughSignatures
    const invalidArgs = [
      {
        name: "payload does not match hash and PDAs seeds",
        mintPayload: function (): Buffer {
          return new PayloadDepositV1(
            LCHAIN_ID,
            staker1NativeTA,
            100000n,
            Buffer.from(sha256.array("txid")),
            randomNumber(6),
            nativeMintKeypair.publicKey
          ).toBuffer();
        },
        payloadHash: function (payload: Buffer): Buffer {
          return validNativeMintPayload.toHash();
        },
        errorMessage: "MintPayloadHashMismatch"
      },
      {
        name: "destination chain is different",
        mintPayload: function (): Buffer {
          return new PayloadDepositV1(
            Buffer.from(sha256("invalid chain"), "hex"),
            staker1NativeTA,
            100000n,
            Buffer.from(sha256.array("txid")),
            randomNumber(6),
            nativeMintKeypair.publicKey
          ).toBuffer();
        },
        payloadHash: function (payload: Buffer): Buffer {
          return Buffer.from(sha256.array(payload));
        },
        errorMessage: "InvalidChainID"
      },
      {
        name: "recipientTA does not match payload",
        mintPayload: function (): Buffer {
          return new PayloadDepositV1(
            LCHAIN_ID,
            treasuryNativeTA,
            100000n,
            Buffer.from(sha256.array("txid")),
            randomNumber(6),
            nativeMintKeypair.publicKey
          ).toBuffer();
        },
        payloadHash: function (payload: Buffer): Buffer {
          return Buffer.from(sha256.array(payload));
        },
        errorMessage: "RecipientMismatch"
      },
      {
        name: "token is invalid",
        mintPayload: function (): Buffer {
          return new PayloadDepositV1(
            LCHAIN_ID,
            staker1NativeTA,
            100000n,
            Buffer.from(sha256.array("txid")),
            randomNumber(6),
            stakedMintKeypair.publicKey
          ).toBuffer();
        },
        payloadHash: function (payload: Buffer): Buffer {
          return Buffer.from(sha256.array(payload));
        },
        errorMessage: "InvalidTokenAddress"
      },
      {
        name: "payload selector is invalid",
        mintPayload: function (): Buffer {
          return Buffer.concat([
            Buffer.from("f2e73f7c", "hex"),
            Buffer.from(
              ethers.AbiCoder.defaultAbiCoder()
                .encode(
                  ["bytes32", "bytes32", "uint256", "bytes32", "uint32", "bytes32"],
                  [
                    LCHAIN_ID,
                    staker1NativeTA.toBuffer(),
                    100000n,
                    Buffer.from(sha256.array("txid")),
                    randomNumber(6),
                    stakedMintKeypair.publicKey.toBuffer()
                  ]
                )
                .slice(2),
              "hex"
            )
          ]);
        },
        payloadHash: function (payload: Buffer): Buffer {
          return Buffer.from(sha256.array(payload));
        },
        errorMessage: "InvalidPayloadSelector"
      }
    ];

    invalidArgs.forEach(function (arg) {
      it(`mint_from_payload: rejects when ${arg.name}`, async function () {
        const mintPayload = arg.mintPayload();
        const hash = arg.payloadHash(mintPayload);

        const validatedPayloadPDA = PublicKey.findProgramAddressSync(
          [Buffer.from("validated_payload"), hash],
          consortium.programId
        )[0];
        const depositPayloadSpentPDA = PublicKey.findProgramAddressSync(
          [Buffer.from("deposit_payload_spent"), hash],
          program.programId
        )[0];

        await consortiumUtility.createAndFinalizeSession(payer, mintPayload);

        await expect(
          program.methods
            .mintFromPayload(Array.from(Uint8Array.from(mintPayload)), Array.from(Uint8Array.from(hash)))
            .accounts(
              withOptionalBasculeNull({
                payer: payer.publicKey,
                recipient: staker1NativeTA,
                mint: nativeMintKeypair.publicKey,
                mintAuthority: tokenAuth,
                tokenProgram: spl.TOKEN_PROGRAM_ID,
                consortiumValidatedPayload: validatedPayloadPDA,
                depositPayloadSpent: depositPayloadSpentPDA
              })
            )
            .signers([payer])
            .rpc()
        ).to.be.rejectedWith(new RegExp(arg.errorMessage));
      });
    });

    it("successful without fee", async () => {
      await program.methods
        .mintFromPayload(validNativeMintPayload.toBytes(), validNativeMintPayload.toHashBytes())
        .accounts(
          withOptionalBasculeNull({
            payer: payer.publicKey,
            recipient: staker1NativeTA,
            mint: nativeMintKeypair.publicKey,
            mintAuthority: tokenAuth,
            tokenProgram: spl.TOKEN_PROGRAM_ID,
            consortiumValidatedPayload: consortiumUtility.getValidatedPayloadPDA(validNativeMintPayload.toHash()),
            depositPayloadSpent: depositPayloadSpentPDA
          })
        )
        .signers([payer])
        .rpc({ commitment: "confirmed" });

      const balanceAfter = await spl.getAccount(provider.connection, staker1NativeTA);
      expect(balanceAfter.amount).eq(validNativeMintPayload.amount);

      expect(MintEvents[0]).to.be.not.undefined;
      expect(MintEvents[0].recipient.toBase58()).to.be.eq(staker1NativeTA.toBase58());
      expect(MintEvents[0].payloadHash).to.be.deep.eq(Array.from(validNativeMintPayload.toHash()));
    });

    it("mintFromPayload: rejects when payload has been used", async () => {
      await expect(
        program.methods
          .mintFromPayload(validNativeMintPayload.toBytes(), validNativeMintPayload.toHashBytes())
          .accounts(
            withOptionalBasculeNull({
              payer: payer.publicKey,
              recipient: staker1NativeTA,
              mint: nativeMintKeypair.publicKey,
              mintAuthority: tokenAuth,
              tokenProgram: spl.TOKEN_PROGRAM_ID,
              consortiumValidatedPayload: consortiumUtility.getValidatedPayloadPDA(validNativeMintPayload.toHash()),
              depositPayloadSpent: depositPayloadSpentPDA
            })
          )
          .signers([payer])
          .rpc()
      ).to.be.rejectedWith(
        new RegExp(
          `Allocate: account Address \{ address: ${depositPayloadSpentPDA.toBase58()}, base: None \} already in use`
        )
      );
    });

    it("mintWithFee when permit > mintFee", async () => {
      const balanceBefore = await spl.getAccount(provider.connection, staker1NativeTA);
      const treasuryBalanceBefore = await spl.getAccount(provider.connection, treasuryNativeTA);
      mintFee = new BN((feePermit.maxFeesBigInt() - 10n).toString(10));

      await program.methods
        .setMintFee(mintFee)
        .accounts({
          operator: operator.publicKey,
          tokenConfig: nativeTokenConfigPDA
        })
        .signers([operator])
        .rpc({ commitment: "confirmed" });

      const validNativeMintPayload = new PayloadDepositV1(
        LCHAIN_ID,
        staker1NativeTA,
        100000n,
        Buffer.from(sha256(randomNumber(16).toString()), "hex"),
        0,
        nativeMintKeypair.publicKey
      );
      await consortiumUtility.createAndFinalizeSession(payer, validNativeMintPayload.toBuffer());
      const sessionPayloadPDA = await postSessionPayload(payer, validNativeMintPayload.toBuffer());
      const depositPayloadSpentPDA = PublicKey.findProgramAddressSync(
        [Buffer.from("deposit_payload_spent"), validNativeMintPayload.toHash()],
        program.programId
      )[0];

      await program.methods
        .mintWithFee(validNativeMintPayload.toHashBytes(), feePayload, Array.from(feeSignature))
        .accounts(
          withOptionalBasculeNull({
            payer: claimer.publicKey,
            sessionPayload: sessionPayloadPDA,
            recipient: staker1NativeTA,
            mint: nativeMintKeypair.publicKey,
            mintAuthority: tokenAuth,
            tokenProgram: spl.TOKEN_PROGRAM_ID,
            consortiumValidatedPayload: consortiumUtility.getValidatedPayloadPDA(validNativeMintPayload.toHash()),
            depositPayloadSpent: depositPayloadSpentPDA,
            treasuryTokenAccount: treasuryNativeTA
          })
        )
        .preInstructions([ed25519Instruction])
        .signers([claimer])
        .rpc({ commitment: "confirmed" });

      const balanceAfter = await spl.getAccount(provider.connection, staker1NativeTA);
      expect(balanceAfter.amount - balanceBefore.amount).eq(validNativeMintPayload.amount - mintFee.toBigInt());
      const treasuryBalanceAfter = await spl.getAccount(provider.connection, treasuryNativeTA);
      expect(treasuryBalanceAfter.amount - treasuryBalanceBefore.amount).eq(mintFee.toBigInt());
    });

    // Also proves that one permit can be used multiple times
    it("mintWithFee when permit < mintFee", async () => {
      const balanceBefore = await spl.getAccount(provider.connection, staker1NativeTA);
      const treasuryBalanceBefore = await spl.getAccount(provider.connection, treasuryNativeTA);
      mintFee = new BN((feePermit.maxFeesBigInt() + 10n).toString(10));

      await program.methods
        .setMintFee(mintFee)
        .accounts({
          operator: operator.publicKey,
          tokenConfig: nativeTokenConfigPDA
        })
        .signers([operator])
        .rpc({ commitment: "confirmed" });

      const validNativeMintPayload = new PayloadDepositV1(
        LCHAIN_ID,
        staker1NativeTA,
        100000n,
        Buffer.from(sha256(randomNumber(16).toString()), "hex"),
        0,
        nativeMintKeypair.publicKey
      );
      await consortiumUtility.createAndFinalizeSession(payer, validNativeMintPayload.toBuffer());
      const sessionPayloadPDA = await postSessionPayload(payer, validNativeMintPayload.toBuffer());
      const depositPayloadSpentPDA = PublicKey.findProgramAddressSync(
        [Buffer.from("deposit_payload_spent"), validNativeMintPayload.toHash()],
        program.programId
      )[0];

      await program.methods
        .mintWithFee(validNativeMintPayload.toHashBytes(), feePayload, Array.from(feeSignature))
        .accounts(
          withOptionalBasculeNull({
            payer: claimer.publicKey,
            sessionPayload: sessionPayloadPDA,
            recipient: staker1NativeTA,
            mint: nativeMintKeypair.publicKey,
            mintAuthority: tokenAuth,
            tokenProgram: spl.TOKEN_PROGRAM_ID,
            consortiumValidatedPayload: consortiumUtility.getValidatedPayloadPDA(validNativeMintPayload.toHash()),
            depositPayloadSpent: depositPayloadSpentPDA,
            treasuryTokenAccount: treasuryNativeTA
          })
        )
        .preInstructions([ed25519Instruction])
        .signers([claimer])
        .rpc({ commitment: "confirmed" });

      const balanceAfter = await spl.getAccount(provider.connection, staker1NativeTA);
      expect(balanceAfter.amount - balanceBefore.amount).eq(validNativeMintPayload.amount - feePermit.maxFeesBigInt());
      const treasuryBalanceAfter = await spl.getAccount(provider.connection, treasuryNativeTA);
      expect(treasuryBalanceAfter.amount - treasuryBalanceBefore.amount).eq(feePermit.maxFeesBigInt());
    });

    it("mintWithFee rejects when permit signed by other recipient", async () => {
      const validNativeMintPayload = new PayloadDepositV1(
        LCHAIN_ID,
        staker2NativeTA,
        100000n,
        Buffer.from(sha256(randomNumber(16).toString()), "hex"),
        0,
        nativeMintKeypair.publicKey
      );
      await consortiumUtility.createAndFinalizeSession(payer, validNativeMintPayload.toBuffer());
      const sessionPayloadPDA = await postSessionPayload(payer, validNativeMintPayload.toBuffer());
      const depositPayloadSpentPDA = PublicKey.findProgramAddressSync(
        [Buffer.from("deposit_payload_spent"), validNativeMintPayload.toHash()],
        program.programId
      )[0];

      await expect(
        program.methods
          .mintWithFee(validNativeMintPayload.toHashBytes(), feePayload, Array.from(feeSignature))
          .accounts(
            withOptionalBasculeNull({
              payer: claimer.publicKey,
              sessionPayload: sessionPayloadPDA,
              recipient: staker2NativeTA,
              mint: nativeMintKeypair.publicKey,
              mintAuthority: tokenAuth,
              tokenProgram: spl.TOKEN_PROGRAM_ID,
              consortiumValidatedPayload: consortiumUtility.getValidatedPayloadPDA(validNativeMintPayload.toHash()),
              depositPayloadSpent: depositPayloadSpentPDA,
              treasuryTokenAccount: treasuryNativeTA
            })
          )
          .preInstructions([ed25519Instruction])
          .signers([claimer])
          .rpc()
      ).to.be.rejectedWith("InvalidPublicKey");
    });

    it("mintWithFee rejects when destination chain is different", async () => {
      const feePermit = new FeePermit(program.programId, LEDGER_LCHAIN_ID, 200, Math.floor(Date.now() / 1000) + 30);
      const feePayload = Array.from(feePermit.bytes());
      const feeSignature = feePermit.signature(staker1.secretKey);
      const ed25519Instruction = Ed25519Program.createInstructionWithPublicKey({
        publicKey: staker1.publicKey.toBytes(),
        message: feePermit.bytes(),
        signature: feeSignature
      });

      const validNativeMintPayload = new PayloadDepositV1(
        LCHAIN_ID,
        staker1NativeTA,
        100000n,
        Buffer.from(sha256(randomNumber(16).toString()), "hex"),
        0,
        nativeMintKeypair.publicKey
      );
      await consortiumUtility.createAndFinalizeSession(payer, validNativeMintPayload.toBuffer());
      const sessionPayloadPDA = await postSessionPayload(payer, validNativeMintPayload.toBuffer());
      const depositPayloadSpentPDA = PublicKey.findProgramAddressSync(
        [Buffer.from("deposit_payload_spent"), validNativeMintPayload.toHash()],
        program.programId
      )[0];

      await expect(
        program.methods
          .mintWithFee(validNativeMintPayload.toHashBytes(), feePayload, Array.from(feeSignature))
          .accounts(
            withOptionalBasculeNull({
              payer: claimer.publicKey,
              sessionPayload: sessionPayloadPDA,
              recipient: staker1NativeTA,
              mint: nativeMintKeypair.publicKey,
              mintAuthority: tokenAuth,
              tokenProgram: spl.TOKEN_PROGRAM_ID,
              consortiumValidatedPayload: consortiumUtility.getValidatedPayloadPDA(validNativeMintPayload.toHash()),
              depositPayloadSpent: depositPayloadSpentPDA,
              treasuryTokenAccount: treasuryNativeTA
            })
          )
          .preInstructions([ed25519Instruction])
          .signers([claimer])
          .rpc()
      ).to.be.rejectedWith("InvalidChainID");
    });

    it("mintWithFee rejects when fee approval is different from signed", async () => {
      const feePermit = new FeePermit(program.programId, LEDGER_LCHAIN_ID, 200, Math.floor(Date.now() / 1000) + 30);
      const feePermitSigned = new FeePermit(
        program.programId,
        LEDGER_LCHAIN_ID,
        100,
        Math.floor(Date.now() / 1000) + 30
      );
      const feeSignature = feePermitSigned.signature(staker1.secretKey);
      const ed25519Instruction = Ed25519Program.createInstructionWithPublicKey({
        publicKey: staker1.publicKey.toBytes(),
        message: feePermitSigned.bytes(),
        signature: feeSignature
      });

      const validNativeMintPayload = new PayloadDepositV1(
        LCHAIN_ID,
        staker1NativeTA,
        100000n,
        Buffer.from(sha256(randomNumber(16).toString()), "hex"),
        0,
        nativeMintKeypair.publicKey
      );
      await consortiumUtility.createAndFinalizeSession(payer, validNativeMintPayload.toBuffer());
      const sessionPayloadPDA = await postSessionPayload(payer, validNativeMintPayload.toBuffer());
      const depositPayloadSpentPDA = PublicKey.findProgramAddressSync(
        [Buffer.from("deposit_payload_spent"), validNativeMintPayload.toHash()],
        program.programId
      )[0];

      await expect(
        program.methods
          .mintWithFee(validNativeMintPayload.toHashBytes(), Array.from(feePermit.bytes()), Array.from(feeSignature))
          .accounts(
            withOptionalBasculeNull({
              payer: claimer.publicKey,
              sessionPayload: sessionPayloadPDA,
              recipient: staker1NativeTA,
              mint: nativeMintKeypair.publicKey,
              mintAuthority: tokenAuth,
              tokenProgram: spl.TOKEN_PROGRAM_ID,
              consortiumValidatedPayload: consortiumUtility.getValidatedPayloadPDA(validNativeMintPayload.toHash()),
              depositPayloadSpent: depositPayloadSpentPDA,
              treasuryTokenAccount: treasuryNativeTA
            })
          )
          .preInstructions([ed25519Instruction])
          .signers([claimer])
          .rpc()
      ).to.be.rejectedWith("InvalidMessage");
    });

    it("mintWithFee rejects when fee approval prefix is invalid", async () => {
      const feePermit = new FeePermit(
        program.programId,
        LEDGER_LCHAIN_ID,
        200,
        Math.floor(Date.now() / 1000) + 30,
        "aaacbbb2"
      );
      const feePayload = Array.from(feePermit.bytes());
      const feeSignature = feePermit.signature(staker1.secretKey);
      const ed25519Instruction = Ed25519Program.createInstructionWithPublicKey({
        publicKey: staker1.publicKey.toBytes(),
        message: feePermit.bytes(),
        signature: feeSignature
      });

      const validNativeMintPayload = new PayloadDepositV1(
        LCHAIN_ID,
        staker1NativeTA,
        100000n,
        Buffer.from(sha256(randomNumber(16).toString()), "hex"),
        0,
        nativeMintKeypair.publicKey
      );
      await consortiumUtility.createAndFinalizeSession(payer, validNativeMintPayload.toBuffer());
      const sessionPayloadPDA = await postSessionPayload(payer, validNativeMintPayload.toBuffer());
      const depositPayloadSpentPDA = PublicKey.findProgramAddressSync(
        [Buffer.from("deposit_payload_spent"), validNativeMintPayload.toHash()],
        program.programId
      )[0];

      await expect(
        program.methods
          .mintWithFee(validNativeMintPayload.toHashBytes(), feePayload, Array.from(feeSignature))
          .accounts(
            withOptionalBasculeNull({
              payer: claimer.publicKey,
              sessionPayload: sessionPayloadPDA,
              recipient: staker1NativeTA,
              mint: nativeMintKeypair.publicKey,
              mintAuthority: tokenAuth,
              tokenProgram: spl.TOKEN_PROGRAM_ID,
              consortiumValidatedPayload: consortiumUtility.getValidatedPayloadPDA(validNativeMintPayload.toHash()),
              depositPayloadSpent: depositPayloadSpentPDA,
              treasuryTokenAccount: treasuryNativeTA
            })
          )
          .preInstructions([ed25519Instruction])
          .signers([claimer])
          .rpc()
      ).to.be.rejectedWith("InvalidFeeAction");
    });

    it("mintWithFee rejects when permit has expired", async () => {
      const validNativeMintPayload = new PayloadDepositV1(
        LCHAIN_ID,
        staker1NativeTA,
        100000n,
        Buffer.from(sha256(randomNumber(16).toString()), "hex"),
        0,
        nativeMintKeypair.publicKey
      );
      await consortiumUtility.createAndFinalizeSession(payer, validNativeMintPayload.toBuffer());
      const sessionPayloadPDA = await postSessionPayload(payer, validNativeMintPayload.toBuffer());
      const depositPayloadSpentPDA = PublicKey.findProgramAddressSync(
        [Buffer.from("deposit_payload_spent"), validNativeMintPayload.toHash()],
        program.programId
      )[0];

      const timeNow = Math.floor(Date.now() / 1000);
      const timeWait = feePermit.expire - timeNow + 5;
      await new Promise(resolve => setTimeout(resolve, timeWait * 1000));

      await expect(
        program.methods
          .mintWithFee(validNativeMintPayload.toHashBytes(), feePayload, Array.from(feeSignature))
          .accounts(
            withOptionalBasculeNull({
              payer: claimer.publicKey,
              sessionPayload: sessionPayloadPDA,
              recipient: staker1NativeTA,
              mint: nativeMintKeypair.publicKey,
              mintAuthority: tokenAuth,
              tokenProgram: spl.TOKEN_PROGRAM_ID,
              consortiumValidatedPayload: consortiumUtility.getValidatedPayloadPDA(validNativeMintPayload.toHash()),
              depositPayloadSpent: depositPayloadSpentPDA,
              treasuryTokenAccount: treasuryNativeTA
            })
          )
          .preInstructions([ed25519Instruction])
          .signers([claimer])
          .rpc()
      ).to.be.rejectedWith("FeeApprovalExpired");
    });
  });

  describe("Mint from Ledger via GMP", () => {
    let gmpMessageHash: Buffer;

    it("mint native", async () => {
      const toMintAmount = BigInt(10000000);
      const mintMsg = new MintMsg(nativeMintKeypair.publicKey.toBuffer(), staker1NativeTA.toBuffer(), toMintAmount);
      const inboundMessagePath = Buffer.from(
        keccak256(Buffer.concat([LEDGER_MAILBOX_ADDRESS, LEDGER_LCHAIN_ID, LCHAIN_ID])).slice(2),
        "hex"
      );
      const gmpMessage = messageV1(
        inboundMessagePath,
        0,
        BTCSTAKING_MODULE_ADDRESS,
        program.programId.toBuffer(),
        PublicKey.default.toBuffer(),
        mintMsg.toBuffer()
      );
      gmpMessageHash = Buffer.from(sha256(gmpMessage), "hex");
      const gmpMessageHashBz = Array.from(Uint8Array.from(gmpMessageHash));
      const messageHandledPDA = PublicKey.findProgramAddressSync(
        [Buffer.from("message_handled"), gmpMessageHash],
        program.programId
      )[0];

      await mailboxUtilities.deliverMessage(LEDGER_MAILBOX_ADDRESS, LEDGER_LCHAIN_ID, payer, gmpMessage);

      const balanceBefore = await spl.getAccount(provider.connection, staker1NativeTA);

      await mailbox.methods
        .handleMessage(gmpMessageHashBz)
        .accounts({
          handler: payer.publicKey,
          recipientProgram: program.programId
        })
        .remainingAccounts([
          {
            pubkey: payer.publicKey,
            isWritable: true,
            isSigner: true
          },
          {
            pubkey: configPDA,
            isWritable: false,
            isSigner: false
          },
          {
            pubkey: messageHandledPDA,
            isWritable: true,
            isSigner: false
          },
          {
            pubkey: spl.TOKEN_PROGRAM_ID,
            isWritable: false,
            isSigner: false
          },
          {
            pubkey: staker1NativeTA,
            isWritable: true,
            isSigner: false
          },
          {
            pubkey: nativeMintKeypair.publicKey,
            isWritable: true,
            isSigner: false
          },
          {
            pubkey: tokenAuth,
            isWritable: false,
            isSigner: false
          },
          {
            pubkey: tokenAuth,
            isWritable: false,
            isSigner: false
          },
          {
            pubkey: SystemProgram.programId,
            isWritable: false,
            isSigner: false
          },
          {
            pubkey: program.programId,
            isWritable: false,
            isSigner: false
          },
          {
            pubkey: program.programId,
            isWritable: false,
            isSigner: false
          },
          {
            pubkey: program.programId,
            isWritable: false,
            isSigner: false
          },
          {
            pubkey: program.programId,
            isWritable: false,
            isSigner: false
          },
          {
            pubkey: program.programId,
            isWritable: false,
            isSigner: false
          }
        ])
        .signers([payer])
        .rpc({ commitment: "confirmed" });

      const balanceAfter = await spl.getAccount(provider.connection, staker1NativeTA);
      expect(balanceAfter.amount).eq(balanceBefore.amount + toMintAmount);
    });

    it("mint staked", async () => {
      const toMintAmount = BigInt(10000000);
      const mintMsg = new MintMsg(stakedMintKeypair.publicKey.toBuffer(), staker1StakedTA.toBuffer(), toMintAmount);
      const inboundMessagePath = Buffer.from(
        keccak256(Buffer.concat([LEDGER_MAILBOX_ADDRESS, LEDGER_LCHAIN_ID, LCHAIN_ID])).slice(2),
        "hex"
      );
      const gmpMessage = messageV1(
        inboundMessagePath,
        0,
        BTCSTAKING_MODULE_ADDRESS,
        program.programId.toBuffer(),
        PublicKey.default.toBuffer(),
        mintMsg.toBuffer()
      );
      const gmpMessageHash = Buffer.from(sha256(gmpMessage), "hex");
      const gmpMessageHashBz = Array.from(Uint8Array.from(gmpMessageHash));
      const messageHandledPDA = PublicKey.findProgramAddressSync(
        [Buffer.from("message_handled"), gmpMessageHash],
        program.programId
      )[0];

      await mailboxUtilities.deliverMessage(LEDGER_MAILBOX_ADDRESS, LEDGER_LCHAIN_ID, payer, gmpMessage);

      const balanceBefore = await spl.getAccount(provider.connection, staker1StakedTA);

      await mailbox.methods
        .handleMessage(gmpMessageHashBz)
        .accounts({
          handler: payer.publicKey,
          recipientProgram: program.programId
        })
        .remainingAccounts([
          {
            pubkey: payer.publicKey,
            isWritable: true,
            isSigner: true
          },
          {
            pubkey: configPDA,
            isWritable: false,
            isSigner: false
          },
          {
            pubkey: messageHandledPDA,
            isWritable: true,
            isSigner: false
          },
          {
            pubkey: spl.TOKEN_PROGRAM_ID,
            isWritable: false,
            isSigner: false
          },
          {
            pubkey: staker1StakedTA,
            isWritable: true,
            isSigner: false
          },
          {
            pubkey: stakedMintKeypair.publicKey,
            isWritable: true,
            isSigner: false
          },
          {
            pubkey: tokenAuth,
            isWritable: false,
            isSigner: false
          },
          {
            pubkey: tokenAuth,
            isWritable: false,
            isSigner: false
          },
          {
            pubkey: SystemProgram.programId,
            isWritable: false,
            isSigner: false
          },
          { pubkey: program.programId, isWritable: false, isSigner: false },
          { pubkey: program.programId, isWritable: false, isSigner: false },
          { pubkey: program.programId, isWritable: false, isSigner: false },
          { pubkey: program.programId, isWritable: false, isSigner: false },
          { pubkey: program.programId, isWritable: false, isSigner: false }
        ])
        .signers([payer])
        .rpc({ commitment: "confirmed" });

      const balanceAfter = await spl.getAccount(provider.connection, staker1StakedTA);
      expect(balanceAfter.amount).eq(balanceBefore.amount + toMintAmount);
    });

    const invalidArgs = [
      {
        name: "message sender is not staking module",
        msgSender: (): Buffer => Buffer.from("0000000000000000000000008bf729ffe074caee622c02928173467e658e19e2", "hex"),
        token: () => nativeMintKeypair.publicKey,
        tokenRecipient: () => staker1NativeTA,
        amount: BigInt(1000000),
        error: "InvalidMessageSender"
      },
      {
        name: "invalid token mint account",
        msgSender: (): Buffer => BTCSTAKING_MODULE_ADDRESS,
        token: () => stakedMintKeypair.publicKey,
        tokenRecipient: () => staker1NativeTA,
        amount: BigInt(1000000),
        error: "InvalidTokenAddress"
      },
      {
        name: "invalid recipient account",
        msgSender: (): Buffer => BTCSTAKING_MODULE_ADDRESS,
        token: () => nativeMintKeypair.publicKey,
        tokenRecipient: () => staker2NativeTA,
        amount: BigInt(1000000),
        error: "RecipientMismatch"
      },
      {
        name: "amount is 0",
        msgSender: (): Buffer => BTCSTAKING_MODULE_ADDRESS,
        token: () => nativeMintKeypair.publicKey,
        tokenRecipient: () => staker1NativeTA,
        amount: BigInt(0),
        error: "ZeroAmount"
      }
    ];

    invalidArgs.forEach(function (arg) {
      it(`gmpReceive rejects when ${arg.name}`, async function () {
        const toMintAmount = arg.amount;
        const mintMsg = new MintMsg(arg.token().toBuffer(), arg.tokenRecipient().toBuffer(), toMintAmount);
        const inboundMessagePath = Buffer.from(
          keccak256(Buffer.concat([LEDGER_MAILBOX_ADDRESS, LEDGER_LCHAIN_ID, LCHAIN_ID])).slice(2),
          "hex"
        );
        const gmpMessage = messageV1(
          inboundMessagePath,
          0,
          arg.msgSender(),
          program.programId.toBuffer(),
          PublicKey.default.toBuffer(),
          mintMsg.toBuffer()
        );
        gmpMessageHash = Buffer.from(sha256(gmpMessage), "hex");
        const gmpMessageHashBz = Array.from(Uint8Array.from(gmpMessageHash));
        const messageHandledPDA = PublicKey.findProgramAddressSync(
          [Buffer.from("message_handled"), gmpMessageHash],
          program.programId
        )[0];

        await mailboxUtilities.deliverMessage(LEDGER_MAILBOX_ADDRESS, LEDGER_LCHAIN_ID, payer, gmpMessage);

        await expect(
          mailbox.methods
            .handleMessage(gmpMessageHashBz)
            .accounts({
              handler: payer.publicKey,
              recipientProgram: program.programId
            })
            .remainingAccounts([
              {
                pubkey: payer.publicKey,
                isWritable: true,
                isSigner: true
              },
              {
                pubkey: configPDA,
                isWritable: false,
                isSigner: false
              },
              {
                pubkey: messageHandledPDA,
                isWritable: true,
                isSigner: false
              },
              {
                pubkey: spl.TOKEN_PROGRAM_ID,
                isWritable: false,
                isSigner: false
              },
              {
                pubkey: staker1NativeTA,
                isWritable: true,
                isSigner: false
              },
              {
                pubkey: nativeMintKeypair.publicKey,
                isWritable: true,
                isSigner: false
              },
              {
                pubkey: tokenAuth,
                isWritable: false,
                isSigner: false
              },
              {
                pubkey: tokenAuth,
                isWritable: false,
                isSigner: false
              },
              {
                pubkey: SystemProgram.programId,
                isWritable: false,
                isSigner: false
              },
              { pubkey: program.programId, isWritable: false, isSigner: false },
              { pubkey: program.programId, isWritable: false, isSigner: false },
              { pubkey: program.programId, isWritable: false, isSigner: false },
              { pubkey: program.programId, isWritable: false, isSigner: false },
              { pubkey: program.programId, isWritable: false, isSigner: false }
            ])
            .signers([payer])
            .rpc()
        ).to.be.rejectedWith(arg.error);
      });
    });

    it("gmpReceive rejects when message prefix is invalid", async function () {
      const toMintAmount = BigInt(1000000);
      const mintMsg = new MintMsg(
        nativeMintKeypair.publicKey.toBuffer(),
        staker1NativeTA.toBuffer(),
        toMintAmount,
        REDEEM_SELECTOR
      );
      const inboundMessagePath = Buffer.from(
        keccak256(Buffer.concat([LEDGER_MAILBOX_ADDRESS, LEDGER_LCHAIN_ID, LCHAIN_ID])).slice(2),
        "hex"
      );
      const gmpMessage = messageV1(
        inboundMessagePath,
        0,
        BTCSTAKING_MODULE_ADDRESS,
        program.programId.toBuffer(),
        PublicKey.default.toBuffer(),
        mintMsg.toBuffer()
      );
      gmpMessageHash = Buffer.from(sha256(gmpMessage), "hex");
      const gmpMessageHashBz = Array.from(Uint8Array.from(gmpMessageHash));
      const messageHandledPDA = PublicKey.findProgramAddressSync(
        [Buffer.from("message_handled"), gmpMessageHash],
        program.programId
      )[0];

      await mailboxUtilities.deliverMessage(LEDGER_MAILBOX_ADDRESS, LEDGER_LCHAIN_ID, payer, gmpMessage);

      await expect(
        mailbox.methods
          .handleMessage(gmpMessageHashBz)
          .accounts({
            handler: payer.publicKey,
            recipientProgram: program.programId
          })
          .remainingAccounts([
            {
              pubkey: payer.publicKey,
              isWritable: true,
              isSigner: true
            },
            {
              pubkey: configPDA,
              isWritable: false,
              isSigner: false
            },
            {
              pubkey: messageHandledPDA,
              isWritable: true,
              isSigner: false
            },
            {
              pubkey: spl.TOKEN_PROGRAM_ID,
              isWritable: false,
              isSigner: false
            },
            {
              pubkey: staker1NativeTA,
              isWritable: true,
              isSigner: false
            },
            {
              pubkey: nativeMintKeypair.publicKey,
              isWritable: true,
              isSigner: false
            },
            {
              pubkey: tokenAuth,
              isWritable: false,
              isSigner: false
            },
            {
              pubkey: tokenAuth,
              isWritable: false,
              isSigner: false
            },
            {
              pubkey: SystemProgram.programId,
              isWritable: false,
              isSigner: false
            },
            { pubkey: program.programId, isWritable: false, isSigner: false },
            { pubkey: program.programId, isWritable: false, isSigner: false },
            { pubkey: program.programId, isWritable: false, isSigner: false },
            { pubkey: program.programId, isWritable: false, isSigner: false },
            { pubkey: program.programId, isWritable: false, isSigner: false }
          ])
          .signers([payer])
          .rpc()
      ).to.be.rejectedWith("InvalidMessageSelector");
    });
  });

  describe("Redeem for btc", () => {
    const outboundMsgPath = Array.from(
      Buffer.from(keccak256(Buffer.concat([mailbox.programId.toBuffer(), LCHAIN_ID, LEDGER_LCHAIN_ID])).slice(2), "hex")
    );

    before("Exempt assetRouter from mailbox fees", async () => {
      await mailboxUtilities.setSenderConfig(program.programId, 10000, true);
    });

    const args = [
      {
        name: "partially P2TR",
        scriptPubkey: Buffer.from("5120999d8dd965f148662dc38ab5f4ee0c439cadbcc0ab5c946a45159e30b3713947", "hex"),
        amount: randomNumber(5)
      },
      {
        name: "partially P2WSH",
        scriptPubkey: Buffer.from("002065f91a53cb7120057db3d378bd0f7d944167d43a7dcbff15d6afc4823f1d3ed3", "hex"),
        amount: randomNumber(5)
      },
      {
        name: "partially P2WPKH",
        scriptPubkey: Buffer.from("00143dee6158aac9b40cd766b21a1eb8956e99b1ff03", "hex"),
        amount: randomNumber(5)
      }
    ];

    args.forEach(function (arg) {
      it(`redeemForBtc ${arg.name}`, async function () {
        const balanceBefore = await spl.getAccount(provider.connection, staker1StakedTA);
        const treasuryBalanceBefore = await spl.getAccount(provider.connection, treasuryStakedTA);
        const mintSupplyBefore = await spl.getMint(provider.connection, stakedMintKeypair.publicKey);

        const config = await mailbox.account.config.fetch(mailboxConfigPDA);
        const outboundMessagePDA = PublicKey.findProgramAddressSync(
          [Buffer.from("outbound_message"), config.globalNonce.toArrayLike(Buffer, "be", 8)],
          mailbox.programId
        )[0];

        const stakerSolBalanceBefore = await provider.connection.getBalance(staker1.publicKey);
        const treasurySolBalanceBefore = await provider.connection.getBalance(treasury.publicKey);

        const amount = BigInt(arg.amount);
        await program.methods
          .redeemForBtc(arg.scriptPubkey, new BN(amount.toString()))
          .accounts({
            payer: staker1.publicKey,
            tokenRoute: redeemBtcTokenRoutePDA,
            payerTokenAccount: staker1StakedTA,
            tokenProgram: spl.TOKEN_PROGRAM_ID,
            mint: stakedMintKeypair.publicKey,
            treasuryTokenAccount: treasuryStakedTA,
            mailboxConfig: MailboxUtilities.getMailboxConfigPDA(),
            outboundMessagePath: mailboxUtilities.getOutboundMessagePathPDA(LEDGER_LCHAIN_ID),
            outboundMessage: await MailboxUtilities.getCurrentOutboundMessagePDA(),
            // senderConfig: null,
            // treasury: treasury.publicKey
            senderConfig: mailboxUtilities.getSenderConfigPDA(program.programId),
            treasury: null
          })
          .signers([staker1])
          .rpc({ commitment: "confirmed" });

        const stakerSolBalanceAfter = await provider.connection.getBalance(staker1.publicKey);
        const treasurySolBalanceAfter = await provider.connection.getBalance(treasury.publicKey);
        console.log("staker sol diff", stakerSolBalanceBefore - stakerSolBalanceAfter);
        console.log("treasury sol diff", treasurySolBalanceAfter - treasurySolBalanceBefore);

        const totalFee = stakedRedeemFee.add(stakedToNativeCommission).toNumber();

        const expectedBody = new RedeemMsg(
          BITCOIN_LCHAIN_ID,
          stakedMintKeypair.publicKey.toBuffer(),
          staker1StakedTA.toBuffer(),
          arg.scriptPubkey,
          amount - BigInt(totalFee)
        )
        const expectedGmpMessage = messageV1(
          Buffer.from(outboundMsgPath),
          config.globalNonce.toNumber(),
          Buffer.from(program.programId.toBytes()),
          BTCSTAKING_MODULE_ADDRESS,
          PublicKey.default.toBuffer(),
          expectedBody.toBuffer(),
        );
        const outboundMessageAccount = await provider.connection.getAccountInfo(outboundMessagePDA);
        expect(outboundMessageAccount.data).to.deep.eq(expectedGmpMessage)

        const balanceAfter = await spl.getAccount(provider.connection, staker1StakedTA);
        expect(balanceAfter.amount).eq(balanceBefore.amount - amount);

        const treasuryBalanceAfter = await spl.getAccount(provider.connection, treasuryStakedTA);
        expect(treasuryBalanceAfter.amount).eq(treasuryBalanceBefore.amount + BigInt(totalFee));

        const mintSupplyAfter = await spl.getMint(provider.connection, stakedMintKeypair.publicKey);
        expect(mintSupplyAfter.supply).eq(mintSupplyBefore.supply - amount + BigInt(totalFee));

        //GMP fee exempt
        expect(treasurySolBalanceAfter - treasurySolBalanceBefore).to.be.eq(0);
      });
    });

    it("redeemForBtc from staked rejects when amount = fee", async function () {
      const scriptPubkey = Buffer.from("5120e4ac542bbca2e12bc615744b8f755b30d9e345a2fc8622704031e2e6cdfc2f8e", "hex");
      const amount = stakedRedeemFee.add(stakedToNativeCommission);

      await expect(
        program.methods
          .redeemForBtc(scriptPubkey, amount)
          .accounts({
            payer: staker1.publicKey,
            tokenRoute: redeemBtcTokenRoutePDA,
            payerTokenAccount: staker1StakedTA,
            tokenProgram: spl.TOKEN_PROGRAM_ID,
            mint: stakedMintKeypair.publicKey,
            treasuryTokenAccount: treasuryStakedTA,
            mailboxConfig: MailboxUtilities.getMailboxConfigPDA(),
            outboundMessagePath: mailboxUtilities.getOutboundMessagePathPDA(LEDGER_LCHAIN_ID),
            outboundMessage: await MailboxUtilities.getCurrentOutboundMessagePDA(),
            senderConfig: null,
            treasury: treasury.publicKey
          })
          .signers([staker1])
          .rpc()
      ).to.rejectedWith("FeeGTEAmount");
    });

    it("redeemForBtc from native rejects when amount = fee", async function () {
      const scriptPubkey = Buffer.from("5120e4ac542bbca2e12bc615744b8f755b30d9e345a2fc8622704031e2e6cdfc2f8e", "hex");
      const amount = stakedToNativeCommission;

      await expect(
        program.methods
          .redeemForBtc(scriptPubkey, amount)
          .accounts({
            payer: staker1.publicKey,
            tokenRoute: redeemBtcNativeTokenRoutePDA,
            payerTokenAccount: staker1NativeTA,
            tokenProgram: spl.TOKEN_PROGRAM_ID,
            mint: nativeMintKeypair.publicKey,
            treasuryTokenAccount: treasuryNativeTA,
            mailboxConfig: MailboxUtilities.getMailboxConfigPDA(),
            outboundMessagePath: mailboxUtilities.getOutboundMessagePathPDA(LEDGER_LCHAIN_ID),
            outboundMessage: await MailboxUtilities.getCurrentOutboundMessagePDA(),
            senderConfig: null,
            treasury: treasury.publicKey
          })
          .signers([staker1])
          .rpc()
      ).to.rejectedWith("FeeGTEAmount");
    });

    it("redeemForBtc from staked rejects when amount below dust limit", async function () {
      const scriptPubkey = Buffer.from("5120e4ac542bbca2e12bc615744b8f755b30d9e345a2fc8622704031e2e6cdfc2f8e", "hex");
      const totalFee = stakedRedeemFee.add(stakedToNativeCommission.sub(new BN(1)));
      const amount = totalFee.add(redeemForBtcMinAmount);

      await expect(
        program.methods
          .redeemForBtc(scriptPubkey, amount)
          .accounts({
            payer: staker1.publicKey,
            tokenRoute: redeemBtcTokenRoutePDA,
            payerTokenAccount: staker1StakedTA,
            tokenProgram: spl.TOKEN_PROGRAM_ID,
            mint: stakedMintKeypair.publicKey,
            treasuryTokenAccount: treasuryStakedTA,
            mailboxConfig: MailboxUtilities.getMailboxConfigPDA(),
            outboundMessagePath: mailboxUtilities.getOutboundMessagePathPDA(LEDGER_LCHAIN_ID),
            outboundMessage: await MailboxUtilities.getCurrentOutboundMessagePDA(),
            senderConfig: null,
            treasury: treasury.publicKey
          })
          .signers([staker1])
          .rpc()
      ).to.rejectedWith("AmountBelowDustLimit");
    });

    it("redeemForBtc from native rejects when amount below dust limit", async function () {
      const scriptPubkey = Buffer.from("5120e4ac542bbca2e12bc615744b8f755b30d9e345a2fc8622704031e2e6cdfc2f8e", "hex");
      const amount = stakedToNativeCommission.add(redeemForBtcMinAmount.sub(new BN(1)));

      await expect(
        program.methods
          .redeemForBtc(scriptPubkey, amount)
          .accounts({
            payer: staker1.publicKey,
            tokenRoute: redeemBtcNativeTokenRoutePDA,
            payerTokenAccount: staker1NativeTA,
            tokenProgram: spl.TOKEN_PROGRAM_ID,
            mint: nativeMintKeypair.publicKey,
            treasuryTokenAccount: treasuryNativeTA,
            mailboxConfig: MailboxUtilities.getMailboxConfigPDA(),
            outboundMessagePath: mailboxUtilities.getOutboundMessagePathPDA(LEDGER_LCHAIN_ID),
            outboundMessage: await MailboxUtilities.getCurrentOutboundMessagePDA(),
            senderConfig: null,
            treasury: treasury.publicKey
          })
          .signers([staker1])
          .rpc()
      ).to.rejectedWith("AmountBelowDustLimit");
    });

    it("redeemForBtc rejects when recipient is P2SH", async function () {
      const scriptPubkey = Buffer.from("a914aec38a317950a98baa9f725c0cb7e50ae473ba2f87", "hex");
      const amount = new BN(randomNumber(5));

      await expect(
        program.methods
          .redeemForBtc(scriptPubkey, amount)
          .accounts({
            payer: staker1.publicKey,
            tokenRoute: redeemBtcTokenRoutePDA,
            payerTokenAccount: staker1StakedTA,
            tokenProgram: spl.TOKEN_PROGRAM_ID,
            mint: stakedMintKeypair.publicKey,
            treasuryTokenAccount: treasuryStakedTA,
            mailboxConfig: MailboxUtilities.getMailboxConfigPDA(),
            outboundMessagePath: mailboxUtilities.getOutboundMessagePathPDA(LEDGER_LCHAIN_ID),
            outboundMessage: await MailboxUtilities.getCurrentOutboundMessagePDA(),
            senderConfig: null,
            treasury: treasury.publicKey
          })
          .signers([staker1])
          .rpc()
      ).to.rejectedWith("UnsupportedRedeemAddress");
    });

    it("redeemForBtc rejects when recipient is P2PKH", async function () {
      const scriptPubkey = Buffer.from("76a914aec38a317950a98baa9f725c0cb7e50ae473ba2f88ac", "hex");
      const amount = new BN(randomNumber(5));

      await expect(
        program.methods
          .redeemForBtc(scriptPubkey, amount)
          .accounts({
            payer: staker1.publicKey,
            tokenRoute: redeemBtcTokenRoutePDA,
            payerTokenAccount: staker1StakedTA,
            tokenProgram: spl.TOKEN_PROGRAM_ID,
            mint: stakedMintKeypair.publicKey,
            treasuryTokenAccount: treasuryStakedTA,
            mailboxConfig: MailboxUtilities.getMailboxConfigPDA(),
            outboundMessagePath: mailboxUtilities.getOutboundMessagePathPDA(LEDGER_LCHAIN_ID),
            outboundMessage: await MailboxUtilities.getCurrentOutboundMessagePDA(),
            senderConfig: null,
            treasury: treasury.publicKey
          })
          .signers([staker1])
          .rpc()
      ).to.rejectedWith("UnsupportedRedeemAddress");
    });

    it("redeemForBtc rejects when recipient is P2PK", async function () {
      const scriptPubkey = Buffer.from(
        "4104678afdb0fe5548271967f1a67130b7105cd6a828e03909a67962e0ea1f61deb649f6bc3f4cef38c4f35504e51ec112de5c384df7ba0b8d578a4c702b6bf11d5fac",
        "hex"
      );
      const amount = new BN(randomNumber(5));

      await expect(
        program.methods
          .redeemForBtc(scriptPubkey, amount)
          .accounts({
            payer: staker1.publicKey,
            tokenRoute: redeemBtcTokenRoutePDA,
            payerTokenAccount: staker1StakedTA,
            tokenProgram: spl.TOKEN_PROGRAM_ID,
            mint: stakedMintKeypair.publicKey,
            treasuryTokenAccount: treasuryStakedTA,
            mailboxConfig: MailboxUtilities.getMailboxConfigPDA(),
            outboundMessagePath: mailboxUtilities.getOutboundMessagePathPDA(LEDGER_LCHAIN_ID),
            outboundMessage: await MailboxUtilities.getCurrentOutboundMessagePDA(),
            senderConfig: null,
            treasury: treasury.publicKey
          })
          .signers([staker1])
          .rpc()
      ).to.rejectedWith("UnsupportedRedeemAddress");
    });

    it("redeemForBtc rejects when recipient is P2MS", async function () {
      const scriptPubkey = Buffer.from(
        "524104d81fd577272bbe73308c93009eec5dc9fc319fc1ee2e7066e17220a5d47a18314578be2faea34b9f1f8ca078f8621acd4bc22897b03daa422b9bf56646b342a24104ec3afff0b2b66e8152e9018fe3be3fc92b30bf886b3487a525997d00fd9da2d012dce5d5275854adc3106572a5d1e12d4211b228429f5a7b2f7ba92eb0475bb14104b49b496684b02855bc32f5daefa2e2e406db4418f3b86bca5195600951c7d918cdbe5e6d3736ec2abf2dd7610995c3086976b2c0c7b4e459d10b34a316d5a5e753ae",
        "hex"
      );
      const amount = new BN(randomNumber(5));

      await expect(
        program.methods
          .redeemForBtc(scriptPubkey, amount)
          .accounts({
            payer: staker1.publicKey,
            tokenRoute: redeemBtcTokenRoutePDA,
            payerTokenAccount: staker1StakedTA,
            tokenProgram: spl.TOKEN_PROGRAM_ID,
            mint: stakedMintKeypair.publicKey,
            treasuryTokenAccount: treasuryStakedTA,
            mailboxConfig: MailboxUtilities.getMailboxConfigPDA(),
            outboundMessagePath: mailboxUtilities.getOutboundMessagePathPDA(LEDGER_LCHAIN_ID),
            outboundMessage: await MailboxUtilities.getCurrentOutboundMessagePDA(),
            senderConfig: null,
            treasury: treasury.publicKey
          })
          .signers([staker1])
          .rpc()
      ).to.rejectedWith("UnsupportedRedeemAddress");
    });
  });

  describe("Redeem", () => {
    const outboundMsgPath = Array.from(
      Buffer.from(keccak256(Buffer.concat([mailbox.programId.toBuffer(), LCHAIN_ID, LEDGER_LCHAIN_ID])).slice(2), "hex")
    );

    it("redeem with fees", async () => {
      const balanceBefore = await spl.getAccount(provider.connection, staker1StakedTA);
      const treasuryBalanceBefore = await spl.getAccount(provider.connection, treasuryStakedTA);
      const mintSupplyBefore = await spl.getMint(provider.connection, stakedMintKeypair.publicKey);
      const stakerSolBalanceBefore = await provider.connection.getBalance(staker1.publicKey);
      const treasurySolBalanceBefore = await provider.connection.getBalance(treasury.publicKey);

      //Getting nonce before message is sent
      const config = await mailbox.account.config.fetch(mailboxConfigPDA);
      const outboundMessagePDA = PublicKey.findProgramAddressSync(
        [Buffer.from("outbound_message"), config.globalNonce.toArrayLike(Buffer, "be", 8)],
        mailbox.programId
      )[0];

      const amount = BigInt(100000);
      await program.methods
        .redeem(LCHAIN_ID_BZ, mintNativeAsBytes, Array.from(staker1NativeTA.toBuffer()), new BN(amount.toString()))
        .accounts({
          payer: staker1.publicKey,
          payerTokenAccount: staker1StakedTA,
          tokenProgram: spl.TOKEN_PROGRAM_ID,
          mint: stakedMintKeypair.publicKey,
          treasuryTokenAccount: treasuryStakedTA,
          mailboxConfig: MailboxUtilities.getMailboxConfigPDA(),
          outboundMessagePath: mailboxUtilities.getOutboundMessagePathPDA(LEDGER_LCHAIN_ID),
          outboundMessage: await MailboxUtilities.getCurrentOutboundMessagePDA(),
          senderConfig: mailboxUtilities.getSenderConfigPDA(program.programId),
          treasury: null
        })
        .signers([staker1])
        .rpc({ commitment: "confirmed" });

      const stakerSolBalanceAfter = await provider.connection.getBalance(staker1.publicKey);
      const treasurySolBalanceAfter = await provider.connection.getBalance(treasury.publicKey);
      console.log("staker sol diff", stakerSolBalanceBefore - stakerSolBalanceAfter);
      console.log("treasury sol diff", treasurySolBalanceAfter - treasurySolBalanceBefore);

      const expectedBody = new RedeemMsg(
        LCHAIN_ID,
        stakedMintKeypair.publicKey.toBuffer(),
        staker1StakedTA.toBuffer(),
        staker1NativeTA.toBuffer(),
        amount - BigInt(stakedRedeemFee.toNumber())
      )
      const expectedGmpMessage = messageV1(
        Buffer.from(outboundMsgPath),
        config.globalNonce.toNumber(),
        Buffer.from(program.programId.toBytes()),
        BTCSTAKING_MODULE_ADDRESS,
        PublicKey.default.toBuffer(),
        expectedBody.toBuffer(),
      );
      const outboundMessageAccount = await provider.connection.getAccountInfo(outboundMessagePDA);
      expect(outboundMessageAccount.data).to.deep.eq(expectedGmpMessage)

      const balanceAfter = await spl.getAccount(provider.connection, staker1StakedTA);
      expect(balanceAfter.amount).eq(balanceBefore.amount - amount);

      const treasuryBalanceAfter = await spl.getAccount(provider.connection, treasuryStakedTA);
      expect(treasuryBalanceAfter.amount).eq(treasuryBalanceBefore.amount + BigInt(stakedRedeemFee.toNumber()));

      const mintSupplyAfter = await spl.getMint(provider.connection, stakedMintKeypair.publicKey);
      expect(mintSupplyAfter.supply).eq(mintSupplyBefore.supply - amount + BigInt(stakedRedeemFee.toNumber()));

      //GMP fee exempt
      expect(treasurySolBalanceAfter - treasurySolBalanceBefore).to.be.eq(0);
    });

    const invalidArgsRedeem = [
      {
        name: "unsupported destination chain",
        dChain: () => LEDGER_LCHAIN_ID_BZ,
        dToken: () => mintNativeAsBytes,
        recipient: () => Array.from(payer.publicKey.toBuffer()),
        amount: async () => new BN(randomNumber(5)),
        error: "token_route. Error Code: AccountNotInitialized"
      },
      {
        name: "unsupported destination token",
        dChain: () => LCHAIN_ID_BZ,
        dToken: () => mintStakedAsBytes,
        recipient: () => Array.from(payer.publicKey.toBuffer()),
        amount: async () => new BN(randomNumber(5)),
        error: "token_route. Error Code: AccountNotInitialized"
      },
      {
        name: "amount = fee",
        dChain: () => LCHAIN_ID_BZ,
        dToken: () => mintNativeAsBytes,
        recipient: () => Array.from(payer.publicKey.toBuffer()),
        amount: async () => stakedRedeemFee,
        error: "Fee is greater than or equal to amount"
      },
      {
        name: "amount > balance",
        dChain: () => LCHAIN_ID_BZ,
        dToken: () => mintNativeAsBytes,
        recipient: () => Array.from(payer.publicKey.toBuffer()),
        amount: async () =>
          new BN((await spl.getAccount(provider.connection, staker1StakedTA)).amount.toString()).addn(1),
        error: "insufficient funds"
      }
    ];

    invalidArgsRedeem.forEach(function (arg) {
      it(`redeem rejects when ${arg.name}`, async () => {
        const dChain = arg.dChain();
        const dToken = arg.dToken();
        const recipientTA = arg.recipient();
        const amount = await arg.amount();

        await expect(
          program.methods
            .redeem(dChain, dToken, recipientTA, amount)
            .accounts({
              payer: staker1.publicKey,
              payerTokenAccount: staker1StakedTA,
              tokenProgram: spl.TOKEN_PROGRAM_ID,
              mint: stakedMintKeypair.publicKey,
              treasuryTokenAccount: treasuryStakedTA,
              mailboxConfig: MailboxUtilities.getMailboxConfigPDA(),
              outboundMessagePath: mailboxUtilities.getOutboundMessagePathPDA(LEDGER_LCHAIN_ID),
              outboundMessage: await MailboxUtilities.getCurrentOutboundMessagePDA(),
              senderConfig: mailboxUtilities.getSenderConfigPDA(staker1.publicKey),
              treasury: null
            })
            .signers([staker1])
            .rpc()
        ).to.be.rejectedWith(arg.error);
      });
    });
  });

  describe("Deposit", () => {
    const outboundMsgPath = Array.from(
      Buffer.from(keccak256(Buffer.concat([mailbox.programId.toBuffer(), LCHAIN_ID, LEDGER_LCHAIN_ID])).slice(2), "hex")
    );

    it("native to staked: successful without gmp fees", async () => {
      const balanceBefore = await spl.getAccount(provider.connection, staker1NativeTA);
      const mintSupplyBefore = await spl.getMint(provider.connection, nativeMintKeypair.publicKey);
      const stakerSolBalanceBefore = await provider.connection.getBalance(staker1.publicKey);
      const treasurySolBalanceBefore = await provider.connection.getBalance(treasury.publicKey);

      //Getting nonce before message is sent
      const config = await mailbox.account.config.fetch(mailboxConfigPDA);
      const outboundMessagePDA = PublicKey.findProgramAddressSync(
        [Buffer.from("outbound_message"), config.globalNonce.toArrayLike(Buffer, "be", 8)],
        mailbox.programId
      )[0];

      const amount = BigInt(100000);
      await program.methods
        .deposit(
          LCHAIN_ID_BZ,
          mintStakedAsBytes,
          Array.from(Uint8Array.from(staker1StakedTA.toBuffer())),
          new BN(amount.toString())
        )
        .accounts({
          payer: staker1.publicKey,
          payerTokenAccount: staker1NativeTA,
          tokenProgram: spl.TOKEN_PROGRAM_ID,
          mint: nativeMintKeypair.publicKey,
          mailboxConfig: MailboxUtilities.getMailboxConfigPDA(),
          outboundMessagePath: mailboxUtilities.getOutboundMessagePathPDA(LEDGER_LCHAIN_ID),
          outboundMessage: await MailboxUtilities.getCurrentOutboundMessagePDA(),
          senderConfig: mailboxUtilities.getSenderConfigPDA(program.programId),
          treasury: null
        })
        .signers([staker1])
        .rpc({ commitment: "confirmed" });

      const stakerSolBalanceAfter = await provider.connection.getBalance(staker1.publicKey);
      const treasurySolBalanceAfter = await provider.connection.getBalance(treasury.publicKey);
      console.log("staker sol diff", stakerSolBalanceBefore - stakerSolBalanceAfter);
      console.log("treasury sol diff", treasurySolBalanceAfter - treasurySolBalanceBefore);


      const expectedBody = new DepositMsg(
        LCHAIN_ID,
        stakedMintKeypair.publicKey.toBuffer(),
        staker1NativeTA.toBuffer(),
        staker1StakedTA.toBuffer(),
        amount
      )
      const expectedGmpMessage = messageV1(
        Buffer.from(outboundMsgPath),
        config.globalNonce.toNumber(),
        Buffer.from(program.programId.toBytes()),
        BTCSTAKING_MODULE_ADDRESS,
        PublicKey.default.toBuffer(),
        expectedBody.toBuffer(),
      );
      const outboundMessageAccount = await provider.connection.getAccountInfo(outboundMessagePDA);
      expect(outboundMessageAccount.data).to.deep.eq(expectedGmpMessage)

      const balanceAfter = await spl.getAccount(provider.connection, staker1NativeTA);
      expect(balanceAfter.amount).eq(balanceBefore.amount - amount);

      const mintSupplyAfter = await spl.getMint(provider.connection, nativeMintKeypair.publicKey);
      expect(mintSupplyAfter.supply).eq(mintSupplyBefore.supply - amount);

      //GMP fee exempt
      expect(treasurySolBalanceAfter - treasurySolBalanceBefore).to.be.eq(0);
    });

    const invalidArgs = [
      {
        name: "unsupported destination chain",
        dChain: () => LEDGER_LCHAIN_ID_BZ,
        dToken: () => mintStakedAsBytes,
        recipient: () => Array.from(payer.publicKey.toBuffer()),
        amount: async () => new BN(randomNumber(5)),
        error: "token_route. Error Code: AccountNotInitialized"
      },
      {
        name: "unsupported destination token",
        dChain: () => LCHAIN_ID_BZ,
        dToken: () => mintNativeAsBytes,
        recipient: () => Array.from(payer.publicKey.toBuffer()),
        amount: async () => new BN(randomNumber(5)),
        error: "token_route. Error Code: AccountNotInitialized"
      },
      {
        name: "amount = 0",
        dChain: () => LCHAIN_ID_BZ,
        dToken: () => mintStakedAsBytes,
        recipient: () => Array.from(payer.publicKey.toBuffer()),
        amount: async () => new BN(0),
        error: "ZeroAmount"
      },
      {
        name: "amount > balance",
        dChain: () => LCHAIN_ID_BZ,
        dToken: () => mintStakedAsBytes,
        recipient: () => Array.from(payer.publicKey.toBuffer()),
        amount: async () =>
          new BN((await spl.getAccount(provider.connection, staker1NativeTA)).amount.toString()).addn(1),
        error: "insufficient funds"
      }
    ];

    invalidArgs.forEach(function (arg) {
      it(`deposit rejects when ${arg.name}`, async () => {
        const dChain = arg.dChain();
        const dToken = arg.dToken();
        const recipientTA = arg.recipient();
        const amount = await arg.amount();

        await expect(
          program.methods
            .deposit(dChain, dToken, recipientTA, amount)
            .accounts({
              payer: staker1.publicKey,
              payerTokenAccount: staker1NativeTA,
              tokenProgram: spl.TOKEN_PROGRAM_ID,
              mint: nativeMintKeypair.publicKey,
              mailboxConfig: MailboxUtilities.getMailboxConfigPDA(),
              outboundMessagePath: mailboxUtilities.getOutboundMessagePathPDA(LEDGER_LCHAIN_ID),
              outboundMessage: await MailboxUtilities.getCurrentOutboundMessagePDA(),
              senderConfig: mailboxUtilities.getSenderConfigPDA(staker1.publicKey),
              treasury: null
            })
            .signers([staker1])
            .rpc()
        ).to.be.rejectedWith(arg.error);
      });
    });
  });

  describe("Ratio", function () {});
});
