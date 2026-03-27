import "dotenv/config";
import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { PublicKey, Keypair, LAMPORTS_PER_SOL, SystemProgram } from "@solana/web3.js";
import * as spl from "@solana/spl-token";
import { Consortium } from "../target/types/consortium";
import { Mailbox } from "../target/types/mailbox";
import { sha256 } from "js-sha256";
import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import { ConsortiumUtility } from "./consortium_utilities";
import { MailboxUtilities } from "./mailbox_utilities";
import { keccak256, randomBytes } from "ethers";
import { messageV1 } from "./mailbox_utilities";
import { Bridge } from "../target/types/bridge";

chai.use(chaiAsPromised);
const expect = chai.expect;

function toHexString(byteArray: Uint8Array): string {
  return Array.from(byteArray, function (byte: number) {
    return ("0" + (byte & 0xff).toString(16)).slice(-2);
  }).join("");
}

class BridgePayload {
  version: string;
  token: string;
  sender: string;
  recipient: string;
  amount: string;

  constructor(token: Uint8Array, sender: Uint8Array, recipient: Uint8Array, amount: number, version: number = 1) {
    this.version = ("00" + version.toString(16)).slice(-2);
    this.token = toHexString(token);
    this.sender = toHexString(sender);
    this.recipient = toHexString(recipient);
    this.amount = ("0000000000000000000000000000000000000000000000000000000000000000" + amount.toString(16)).slice(-64);
  }

  hex(): string {
    return this.version + this.token + this.sender + this.recipient + this.amount;
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

  amountBigInt(): bigint {
    return BigInt("0x" + this.amount);
  }
}

describe("Bridge", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const consortium = anchor.workspace.Consortium as Program<Consortium>;
  const mailbox = anchor.workspace.Mailbox as Program<Mailbox>;
  const bridge = anchor.workspace.Bridge as Program<Bridge>;

  let nonceForeignChain = 0;
  let consortiumUtility: ConsortiumUtility;
  let mailboxUtilities: MailboxUtilities;
  const payer = Keypair.generate();
  const treasury = Keypair.generate();
  const user = Keypair.generate();
  const sender = Keypair.generate();
  const admin = Keypair.generate();
  const pauser = Keypair.generate();
  const minter = Keypair.generate();
  const mintKeys = Keypair.fromSeed(Uint8Array.from(Array(32).fill(5)));
  const mintKeys2 = Keypair.fromSeed(Uint8Array.from(Array(32).fill(7)));
  const tokenAuth = PublicKey.findProgramAddressSync(
    [Buffer.from("token_authority")],
    bridge.programId
  )[0] as PublicKey;

  let multisig: PublicKey;
  let mint: PublicKey;
  let mint2: PublicKey;
  let userTA: PublicKey;
  let userTA2: PublicKey;
  let senderTA: PublicKey;
  let senderTA2: PublicKey;
  let localTokenConfigPDA: PublicKey;
  let localTokenConfigPDA2: PublicKey;
  let remoteTokenConfigPDA11: PublicKey;
  let remoteTokenConfigPDA21: PublicKey;
  let remoteTokenConfigPDA22: PublicKey;
  let remoteTokenConfigPDA12: PublicKey;

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

  const lchainId = Buffer.from("02296998a6f8e2a784db5d9f95e18fc23f70441a1039446801089879b08c7ef0", "hex");
  const foreignLchainId = Buffer.from(sha256("foreign-lchain-id-1"), "hex");
  const foreignLchainId2 = Buffer.from(sha256("foreign-lchain-id-2"), "hex");
  const foreignLchainIdBytes = Array.from(Uint8Array.from(foreignLchainId));
  const foreignLchainIdBytes2 = Array.from(Uint8Array.from(foreignLchainId2));
  const foreignMailboxAddress = Buffer.from(sha256("foreign-mailbox-address"), "hex");
  const foreignMailboxAddressBytes = Array.from(Uint8Array.from(foreignMailboxAddress));
  const foreignBridgeAddress = Buffer.from(sha256("foreign-bridge-address"), "hex");
  const foreignBridgeAddressBytes = Array.from(Uint8Array.from(foreignBridgeAddress));
  const foreignToken = Buffer.from(sha256("foreign-token"), "hex");
  const foreignTokenBytes = Array.from(Uint8Array.from(foreignToken));
  const foreignToken2 = Buffer.from(sha256("foreign-token-2"), "hex");
  const foreignTokenBytes2 = Array.from(Uint8Array.from(foreignToken2));
  const foreignCaller = Buffer.from(sha256("foreign-token"), "hex");
  const foreignCallerBytes = Array.from(Uint8Array.from(foreignCaller));

  const [bridgeConfigPDA] = PublicKey.findProgramAddressSync([Buffer.from("bridge_config")], bridge.programId);
  const [mailboxConfigPDA] = PublicKey.findProgramAddressSync([Buffer.from("mailbox_config")], mailbox.programId);

  const inboundMessagePath = Buffer.from(
    keccak256(Buffer.concat([foreignMailboxAddress, foreignLchainId, lchainId])).slice(2),
    "hex"
  );
  const inboundMessagePath2 = Buffer.from(
    keccak256(Buffer.concat([foreignMailboxAddress, foreignLchainId2, lchainId])).slice(2),
    "hex"
  );
  const [inboundMessagePathPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("inbound_message_path"), foreignLchainId],
    mailbox.programId
  );
  const [inboundMessagePathPDA2] = PublicKey.findProgramAddressSync(
    [Buffer.from("inbound_message_path"), foreignLchainId2],
    mailbox.programId
  );

  const outboundMessagePath = Buffer.from(
    keccak256(Buffer.concat([mailbox.programId.toBuffer(), lchainId, foreignLchainId])).slice(2),
    "hex"
  );
  const outboundMessagePath2 = Buffer.from(
    keccak256(Buffer.concat([mailbox.programId.toBuffer(), lchainId, foreignLchainId2])).slice(2),
    "hex"
  );
  const [outboundMessagePathPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("outbound_message_path"), foreignLchainId],
    mailbox.programId
  );
  const [outboundMessagePathPDA2] = PublicKey.findProgramAddressSync(
    [Buffer.from("outbound_message_path"), foreignLchainId2],
    mailbox.programId
  );
  const outboundMessagePathBytes = Array.from(Uint8Array.from(outboundMessagePath));
  const outboundMessagePathBytes2 = Array.from(Uint8Array.from(outboundMessagePath2));

  const [remoteBridgeConfigPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("remote_bridge_config"), foreignLchainId],
    bridge.programId
  );
  const [remoteBridgeConfigPDA2] = PublicKey.findProgramAddressSync(
    [Buffer.from("remote_bridge_config"), foreignLchainId2],
    bridge.programId
  );
  const [bridgeSenderConfigPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("sender_config"), bridgeConfigPDA.toBuffer()],
    mailbox.programId
  );
  const [senderConfigPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("sender_config"), sender.publicKey.toBuffer()],
    bridge.programId
  );

  const [accountRolesPauserPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("account_roles"), pauser.publicKey.toBuffer()],
    bridge.programId
  );

  const defaultMaxPayloadSize = 1000;
  const bridgeMessageLength = 388;
  const feePerByte = new BN(1000000);
  const remoteSenderBytes = Uint8Array.from(Buffer.from(sha256("some-sender"), "hex"));

  before("fund wallets, initialize consortium utility and deploy mailbox", async () => {
    await fundWallet(payer, 25 * LAMPORTS_PER_SOL);
    await fundWallet(admin, 25 * LAMPORTS_PER_SOL);
    await fundWallet(sender, 25 * LAMPORTS_PER_SOL);
    await fundWallet(minter, 25 * LAMPORTS_PER_SOL);
    await fundWallet(user, 25 * LAMPORTS_PER_SOL);

    multisig = await spl.createMultisig(provider.connection, admin, [tokenAuth, minter.publicKey], 1);
    // mint = await spl.createMint(provider.connection, admin, multisig, admin.publicKey, 8, mintKeys);
    // mint2 = await spl.createMint(provider.connection, admin, multisig, admin.publicKey, 8);
    mint = await spl.createMint(provider.connection, admin, multisig, admin.publicKey, 8, mintKeys, spl.TOKEN_PROGRAM_ID);
    mint2 = await spl.createMint(provider.connection, admin, multisig, admin.publicKey, 8, mintKeys2, spl.TOKEN_2022_PROGRAM_ID);

    [localTokenConfigPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("local_token_config"), mint.toBytes()],
      bridge.programId
    );
    [localTokenConfigPDA2] = PublicKey.findProgramAddressSync(
      [Buffer.from("local_token_config"), mint2.toBytes()],
      bridge.programId
    );
    [remoteTokenConfigPDA11] = PublicKey.findProgramAddressSync(
      [Buffer.from("remote_token_config"), mint.toBytes(), foreignLchainId],
      bridge.programId
    );
    [remoteTokenConfigPDA12] = PublicKey.findProgramAddressSync(
      [Buffer.from("remote_token_config"), mint2.toBytes(), foreignLchainId],
      bridge.programId
    );
    [remoteTokenConfigPDA21] = PublicKey.findProgramAddressSync(
      [Buffer.from("remote_token_config"), mint.toBytes(), foreignLchainId2],
      bridge.programId
    );
    [remoteTokenConfigPDA22] = PublicKey.findProgramAddressSync(
      [Buffer.from("remote_token_config"), mint2.toBytes(), foreignLchainId2],
      bridge.programId
    );

    consortiumUtility = new ConsortiumUtility(consortium);
    consortiumUtility.generateAndAddKeypairs(3);
    await consortiumUtility.initializeConsortiumProgram(admin);

    mailboxUtilities = new MailboxUtilities(consortiumUtility, lchainId, admin, treasury.publicKey);

    await mailbox.methods
      .initialize(admin.publicKey, consortium.programId, treasury.publicKey, defaultMaxPayloadSize, feePerByte)
      .accounts({
        deployer: provider.wallet.publicKey
      })
      .signers([Keypair.fromSecretKey(provider.wallet.payer.secretKey)])
      .rpc();

    userTA = await spl.createAssociatedTokenAccount(provider.connection, user, mint, user.publicKey);
    userTA2 = await spl.createAssociatedTokenAccount(provider.connection, user, mint2, user.publicKey);
    senderTA = await spl.createAssociatedTokenAccount(provider.connection, sender, mint, sender.publicKey);
    senderTA2 = await spl.createAssociatedTokenAccount(provider.connection, sender, mint2, sender.publicKey);
    await spl.mintTo(provider.connection, minter, mint, senderTA, multisig, 100000000, [minter]);
    await spl.mintTo(provider.connection, minter, mint2, senderTA2, multisig, 100000000, [minter]);
  });

  describe("Initialize bridge", () => {
    it("initialize: fails when payer is not deployer", async () => {
      await expect(
        bridge.methods
          .initialize(admin.publicKey, mailbox.programId)
          .accounts({
            deployer: payer.publicKey,
            mint
          })
          .signers([payer])
          .rpc()
      ).to.be.rejectedWith("Unauthorized function call");
    });

    it("initialize: successful", async () => {
      await bridge.methods
        .initialize(admin.publicKey, mailbox.programId)
        .accounts({
          deployer: provider.wallet.publicKey,
          mint
        })
        .signers([Keypair.fromSecretKey(provider.wallet.payer.secretKey)])
        .rpc({ commitment: "confirmed" });

      const cfg = await bridge.account.config.fetch(bridgeConfigPDA);
      expect(cfg.admin.toBase58()).to.be.eq(admin.publicKey.toBase58());
      expect(cfg.pendingAdmin.toBase58()).to.be.eq(SystemProgram.programId.toBase58());
      expect(cfg.paused).to.be.false;
      expect(cfg.mailbox.toBase58()).to.be.eq(mailbox.programId.toBase58());
    });
  });

  describe("grant and revoke roles", () => {
    const pauser = Keypair.generate();
    const [accountRolesPauserPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("account_roles"), pauser.publicKey.toBuffer()],
      bridge.programId
    );

    it("grant role", async () => {
      await bridge.methods
        .grantAccountRole(pauser.publicKey, { pauser: {} })
        .accounts({
          admin: admin.publicKey
        })
        .signers([admin])
        .rpc({ commitment: "confirmed" });
      const accountRoles = await bridge.account.accountRoles.fetch(accountRolesPauserPDA);
      expect(accountRoles.roles).to.be.deep.eq([{ pauser: {} }]);
    });

    it("revoke role", async () => {
      await bridge.methods
        .revokeAccountRoles(pauser.publicKey)
        .accounts({
          admin: admin.publicKey
        })
        .signers([admin])
        .rpc({ commitment: "confirmed" });
      // Check that the account roles PDA was closed (account no longer exists)
      await expect(bridge.account.accountRoles.fetch(accountRolesPauserPDA)).to.be.rejectedWith(
        /Account does not exist|AccountNotFound/
      );
    });
  });

  describe("Set up paths", () => {
    //------------- Mailbox
    it("Enable inbound path from chain_1", async () => {
      await mailbox.methods
        .enableInboundMessagePath(foreignLchainIdBytes, foreignMailboxAddressBytes)
        .accounts({
          admin: admin.publicKey
        })
        .signers([admin])
        .rpc({ commitment: "confirmed" });
    });

    it("Enable inbound path from chain_2", async () => {
      await mailbox.methods
        .enableInboundMessagePath(foreignLchainIdBytes2, foreignMailboxAddressBytes)
        .accounts({
          admin: admin.publicKey
        })
        .signers([admin])
        .rpc({ commitment: "confirmed" });
    });

    it("Enable outbound path to chain_1", async () => {
      await mailbox.methods
        .enableOutboundMessagePath(foreignLchainIdBytes)
        .accounts({
          admin: admin.publicKey
        })
        .signers([admin])
        .rpc({ commitment: "confirmed" });
    });

    it("Enable outbound path to chain_2", async () => {
      await mailbox.methods
        .enableOutboundMessagePath(foreignLchainIdBytes2)
        .accounts({
          admin: admin.publicKey
        })
        .signers([admin])
        .rpc({ commitment: "confirmed" });
    });

    //------------- Bridge
    it("Enable remote bridge on chain_1", async () => {
      const foreignBridgeAddressBytes = Array.from(randomBytes(32));
      await bridge.methods
        .setRemoteBridgeConfig(foreignLchainIdBytes, foreignBridgeAddressBytes)
        .accounts({
          admin: admin.publicKey
        })
        .signers([admin])
        .rpc({ commitment: "confirmed" });

      const bridgeRemoteBridgeConfig = await bridge.account.remoteBridgeConfig.fetch(remoteBridgeConfigPDA);
      expect(bridgeRemoteBridgeConfig.chainId).to.be.deep.eq(foreignLchainIdBytes);
      expect(bridgeRemoteBridgeConfig.bridge).to.be.deep.eq(foreignBridgeAddressBytes);
    });

    it("Change remote bridge on chain_1", async () => {
      await bridge.methods
        .setRemoteBridgeConfig(foreignLchainIdBytes, foreignBridgeAddressBytes)
        .accounts({
          admin: admin.publicKey
        })
        .signers([admin])
        .rpc({ commitment: "confirmed" });

      const bridgeRemoteBridgeConfig = await bridge.account.remoteBridgeConfig.fetch(remoteBridgeConfigPDA);
      expect(bridgeRemoteBridgeConfig.chainId).to.be.deep.eq(foreignLchainIdBytes);
      expect(bridgeRemoteBridgeConfig.bridge).to.be.deep.eq(foreignBridgeAddressBytes);
    });

    it("Enable remote bridge on chain_2", async () => {
      await bridge.methods
        .setRemoteBridgeConfig(foreignLchainIdBytes2, foreignBridgeAddressBytes)
        .accounts({
          admin: admin.publicKey
        })
        .signers([admin])
        .rpc({ commitment: "confirmed" });

      const bridgeRemoteBridgeConfig = await bridge.account.remoteBridgeConfig.fetch(remoteBridgeConfigPDA2);
      expect(bridgeRemoteBridgeConfig.chainId).to.be.deep.eq(foreignLchainIdBytes2);
      expect(bridgeRemoteBridgeConfig.bridge).to.be.deep.eq(foreignBridgeAddressBytes);
    });

    it("Enable local mint_1", async () => {
      await bridge.methods
        .setLocalTokenConfig(mint)
        .accounts({
          admin: admin.publicKey
        })
        .signers([admin])
        .rpc({ commitment: "confirmed" });

      const bridgeLocalTokenConfig = await bridge.account.localTokenConfig.fetch(localTokenConfigPDA);
      expect(bridgeLocalTokenConfig.mint.toBase58()).to.be.eq(mint.toBase58());
    });

    it("Enable local mint_2", async () => {
      await bridge.methods
        .setLocalTokenConfig(mint2)
        .accounts({
          admin: admin.publicKey
        })
        .signers([admin])
        .rpc({ commitment: "confirmed" });

      const bridgeLocalTokenConfig = await bridge.account.localTokenConfig.fetch(localTokenConfigPDA2);
      expect(bridgeLocalTokenConfig.mint.toBase58()).to.be.eq(mint2.toBase58());
    });

    it("Set remote token_1 on chain_1", async () => {
      const foreignTokenBytes = Array.from(randomBytes(32));
      await bridge.methods
        .setRemoteTokenConfig(mint, foreignLchainIdBytes, foreignTokenBytes, 3)
        .accounts({
          admin: admin.publicKey
        })
        .signers([admin])
        .rpc({ commitment: "confirmed" });

      const bridgeRemoteTokenConfig = await bridge.account.remoteTokenConfig.fetch(remoteTokenConfigPDA11);
      expect(bridgeRemoteTokenConfig.chainId).to.be.deep.eq(foreignLchainIdBytes);
      expect(bridgeRemoteTokenConfig.token).to.be.deep.eq(foreignTokenBytes);
      expect(bridgeRemoteTokenConfig.direction).to.be.eq(3);
    });

    it("Change remote token_1 on chain_1", async () => {
      await bridge.methods
        .setRemoteTokenConfig(mint, foreignLchainIdBytes, foreignTokenBytes, 3)
        .accounts({
          admin: admin.publicKey
        })
        .signers([admin])
        .rpc({ commitment: "confirmed" });

      const bridgeRemoteTokenConfig = await bridge.account.remoteTokenConfig.fetch(remoteTokenConfigPDA11);
      expect(bridgeRemoteTokenConfig.chainId).to.be.deep.eq(foreignLchainIdBytes);
      expect(bridgeRemoteTokenConfig.token).to.be.deep.eq(foreignTokenBytes);
      expect(bridgeRemoteTokenConfig.direction).to.be.eq(3);
    });

    it("Set remote token_2 on chain_1", async () => {
      await bridge.methods
        .setRemoteTokenConfig(mint2, foreignLchainIdBytes, foreignTokenBytes2, 3)
        .accounts({
          admin: admin.publicKey
        })
        .signers([admin])
        .rpc({ commitment: "confirmed" });

      const bridgeRemoteTokenConfig = await bridge.account.remoteTokenConfig.fetch(remoteTokenConfigPDA11);
      expect(bridgeRemoteTokenConfig.chainId).to.be.deep.eq(foreignLchainIdBytes);
      expect(bridgeRemoteTokenConfig.token).to.be.deep.eq(foreignTokenBytes);
      expect(bridgeRemoteTokenConfig.direction).to.be.eq(3);
    });

    it("Set remote token_1 on chain_2", async () => {
      await bridge.methods
        .setRemoteTokenConfig(mint, foreignLchainIdBytes2, foreignTokenBytes, 3)
        .accounts({
          admin: admin.publicKey
        })
        .signers([admin])
        .rpc({ commitment: "confirmed" });
    });

    it("Set remote token_2 on chain_2", async () => {
      await bridge.methods
        .setRemoteTokenConfig(mint2, foreignLchainIdBytes2, foreignTokenBytes2, 3)
        .accounts({
          admin: admin.publicKey
        })
        .signers([admin])
        .rpc({ commitment: "confirmed" });
    });

    //------------- Sender config
    it("Set sender config on mailbox", async () => {
      await mailbox.methods
        .setSenderConfig(bridgeConfigPDA, defaultMaxPayloadSize, true)
        .accounts({
          admin: admin.publicKey
        })
        .signers([admin])
        .rpc({ commitment: "confirmed" });
    });

    it("Set sender config on bridge", async () => {
      await bridge.methods
        .setSenderConfig(sender.publicKey, new BN(0), true) //DISCOUNT percent (0 = 100% fee) which pays token pool; fee goes to treasury
        .accounts({
          admin: admin.publicKey
        })
        .signers([admin])
        .rpc({ commitment: "confirmed" });
    });
  });

  describe("Receive bridge", () => {
    const args = [
      {
        name: "tokens to TA account",
        tokenToMint: () => mint.toBytes(),
        receiverAddress: () => userTA.toBytes(),
        receiverTokeAccount: () => userTA,
        inboundMessagePath: () => inboundMessagePath,
        inboundMessagePathPDA: () => inboundMessagePathPDA,
        fromChainId: () => foreignLchainId,
        foreignBridgeAddress: () => foreignBridgeAddress,
        localToken: () => mint,
        remoteBridgeConfigPDA: () => remoteBridgeConfigPDA,
        remoteTokenConfigPDA: () => remoteTokenConfigPDA11,
        localTokenConfig: () => localTokenConfigPDA
      },
      {
        name: "tokens to user account",
        tokenToMint: () => mint.toBytes(),
        receiverAddress: () => user.publicKey.toBytes(),
        receiverTokeAccount: () => userTA,
        inboundMessagePath: () => inboundMessagePath,
        inboundMessagePathPDA: () => inboundMessagePathPDA,
        fromChainId: () => foreignLchainId,
        foreignBridgeAddress: () => foreignBridgeAddress,
        localToken: () => mint,
        remoteBridgeConfigPDA: () => remoteBridgeConfigPDA,
        remoteTokenConfigPDA: () => remoteTokenConfigPDA11,
        localTokenConfig: () => localTokenConfigPDA
      },
      {
        name: "token_2 from chain_1",
        inboundMessagePath: () => inboundMessagePath,
        inboundMessagePathPDA: () => inboundMessagePathPDA,
        fromChainId: () => foreignLchainId,
        foreignBridgeAddress: () => foreignBridgeAddress,

        remoteBridgeConfigPDA: () => remoteBridgeConfigPDA,
        remoteTokenConfigPDA: () => remoteTokenConfigPDA12,

        tokenToMint: () => mint2.toBytes(),
        localToken: () => mint2,
        localTokenConfig: () => localTokenConfigPDA2,

        receiverAddress: () => user.publicKey.toBytes(),
        receiverTokeAccount: () => userTA2
      },
      {
        name: "token_1 from chain_2",
        inboundMessagePath: () => inboundMessagePath2,
        inboundMessagePathPDA: () => inboundMessagePathPDA2,
        fromChainId: () => foreignLchainId2,
        foreignBridgeAddress: () => foreignBridgeAddress,

        remoteBridgeConfigPDA: () => remoteBridgeConfigPDA2,
        remoteTokenConfigPDA: () => remoteTokenConfigPDA21,

        tokenToMint: () => mint.toBytes(),
        localToken: () => mint,
        localTokenConfig: () => localTokenConfigPDA,

        receiverAddress: () => user.publicKey.toBytes(),
        receiverTokeAccount: () => userTA
      },
      {
        name: "token_2 from chain_2",
        inboundMessagePath: () => inboundMessagePath2,
        inboundMessagePathPDA: () => inboundMessagePathPDA2,
        fromChainId: () => foreignLchainId2,
        foreignBridgeAddress: () => foreignBridgeAddress,

        remoteBridgeConfigPDA: () => remoteBridgeConfigPDA2,
        remoteTokenConfigPDA: () => remoteTokenConfigPDA22,

        tokenToMint: () => mint2.toBytes(),
        localToken: () => mint2,
        localTokenConfig: () => localTokenConfigPDA2,

        receiverAddress: () => user.publicKey.toBytes(),
        receiverTokeAccount: () => userTA2
      }
    ];

    args.forEach(function (arg) {
      it(`receive ${arg.name}`, async () => {
        const amount = 1000;
        const bridgePayload = new BridgePayload(arg.tokenToMint(), remoteSenderBytes, arg.receiverAddress(), amount);
        const message = messageV1(
          arg.inboundMessagePath(),
          nonceForeignChain++,
          arg.foreignBridgeAddress(),
          bridge.programId.toBuffer(),
          payer.publicKey.toBuffer(),
          bridgePayload.bytes()
        );

        const { payloadHash, payloadHashBytes } = await mailboxUtilities.deliverMessage(
          foreignMailboxAddress,
          arg.fromChainId(),
          payer,
          message
        );

        const tokenBalanceBefore = await spl.getAccount(provider.connection, arg.receiverTokeAccount());

        const receiverMessageHandledPDA = PublicKey.findProgramAddressSync(
          [Buffer.from("message_handled"), payloadHash],
          bridge.programId
        )[0];
        await mailbox.methods
          .handleMessage(payloadHashBytes)
          .accounts({
            handler: payer.publicKey,
            recipientProgram: bridge.programId
          })
          .remainingAccounts([
            {
              pubkey: payer.publicKey,
              isWritable: true,
              isSigner: true
            },
            {
              pubkey: bridgeConfigPDA,
              isWritable: false,
              isSigner: false
            },
            {
              pubkey: receiverMessageHandledPDA,
              isWritable: true,
              isSigner: false
            },
            {
              // token_program
              pubkey: spl.TOKEN_PROGRAM_ID,
              isWritable: false,
              isSigner: false
            },
            {
              // recipient
              pubkey: arg.receiverTokeAccount(),
              isWritable: true,
              isSigner: false
            },
            {
              // mint
              pubkey: arg.localToken(),
              isWritable: true,
              isSigner: false
            },
            {
              // mint_authority
              pubkey: multisig, // or tokenAuth
              isWritable: false,
              isSigner: false
            },
            {
              // token_authority
              pubkey: tokenAuth,
              isWritable: false,
              isSigner: false
            },
            {
              // remote_bridge_config
              pubkey: arg.remoteBridgeConfigPDA(),
              isWritable: false,
              isSigner: false
            },
            {
              // local_token_config
              pubkey: arg.localTokenConfig(),
              isWritable: false,
              isSigner: false
            },
            {
              // remote_token_config
              pubkey: arg.remoteTokenConfigPDA(),
              isWritable: true,
              isSigner: false
            },
            {
              // inbound_message_path
              pubkey: arg.inboundMessagePathPDA(),
              isWritable: false,
              isSigner: false
            },
            {
              pubkey: SystemProgram.programId,
              isWritable: false,
              isSigner: false
            }
          ])
          .signers([payer])
          .rpc({ commitment: "confirmed" });

        const tokenBalanceAfter = await spl.getAccount(provider.connection, arg.receiverTokeAccount());
        expect(tokenBalanceAfter.amount).to.be.equal(tokenBalanceBefore.amount + BigInt(amount));
      });
    });
  });

  describe("Send bridge", () => {
    before("Set bridge fee = 100% mailbox fee", async () => {
      await mailbox.methods
        .setSenderConfig(bridgeConfigPDA, defaultMaxPayloadSize, true)
        .accounts({
          admin: admin.publicKey
        })
        .signers([admin])
        .rpc({ commitment: "confirmed" });
      await bridge.methods
        .setSenderConfig(sender.publicKey, new BN(0), true) //DISCOUNT percent (0 = 100% fee) which pays token pool; fee goes to treasury
        .accounts({
          admin: admin.publicKey
        })
        .signers([admin])
        .rpc({ commitment: "confirmed" });
    });

    it("send tokens when fee is 100%", async () => {
      const treasurySolBalanceBefore = await provider.connection.getBalance(treasury.publicKey);
      const senderTokenBalanceBefore = await spl.getAccount(provider.connection, senderTA);

      let config = await mailbox.account.config.fetch(mailboxConfigPDA);
      let recipient = Buffer.from(sha256("recipient"), "hex");
      let recipientBz = Array.from(Uint8Array.from(recipient));
      let senderBz = Array.from(Uint8Array.from(user.publicKey.toBuffer()));
      const outboundMessagePDA = PublicKey.findProgramAddressSync(
        [Buffer.from("outbound_message"), config.globalNonce.toArrayLike(Buffer, "be", 8)],
        mailbox.programId
      )[0];

      const amountToSend = 2000;

      await bridge.methods
        .deposit(senderBz, recipientBz, foreignCallerBytes, new BN(amountToSend), null)
        .accountsPartial({
          sender: sender.publicKey, //token pool
          senderTokenAccount: senderTA, //token pool
          tokenProgram: spl.TOKEN_PROGRAM_ID,
          config: bridgeConfigPDA,
          senderConfig: senderConfigPDA,
          remoteBridgeConfig: remoteBridgeConfigPDA,
          localTokenConfig: localTokenConfigPDA,
          remoteTokenConfig: remoteTokenConfigPDA11,
          mint: mint,
          mailbox: mailbox.programId,
          mailboxConfig: mailboxConfigPDA,
          outboundMessage: outboundMessagePDA,
          outboundMessagePath: outboundMessagePathPDA,
          mailboxSenderConfig: bridgeSenderConfigPDA,
          treasury: treasury.publicKey
        })
        .signers([sender])
        .rpc({ commitment: "confirmed" });

      const expectedBody = new BridgePayload(foreignToken, user.publicKey.toBytes(), recipient, amountToSend);
      const expecedGmpMessage = messageV1(
        Buffer.from(outboundMessagePathBytes),
        config.globalNonce.toNumber(),
        bridge.programId.toBuffer(),
        Buffer.from(foreignBridgeAddressBytes),
        foreignCaller,
        expectedBody.bytes(),
      );

      const outboundMessageAccount = await provider.connection.getAccountInfo(outboundMessagePDA);
      expect(outboundMessageAccount.data).to.deep.eq(expecedGmpMessage)


      const expectedFee = feePerByte.muln(bridgeMessageLength);
      const treasurySolBalanceAfter = await provider.connection.getBalance(treasury.publicKey);
      expect(treasurySolBalanceAfter - treasurySolBalanceBefore).to.be.eq(expectedFee.toNumber());

      const tokenBalanceAfter = await spl.getAccount(provider.connection, senderTA);
      expect(senderTokenBalanceBefore.amount - tokenBalanceAfter.amount).to.be.equal(BigInt(amountToSend));
    });

    it("set 60% discount to bridge fee", async () => {
      await bridge.methods
        .setSenderConfig(sender.publicKey, new BN(6000), true) //token pool; fee goes to treasury
        .accounts({
          admin: admin.publicKey
        })
        .signers([admin])
        .rpc({ commitment: "confirmed" });
    });

    //User pays 40% of standard mailbox fee
    it("send tokens with 60% discount", async () => {
      const treasurySolBalanceBefore = await provider.connection.getBalance(treasury.publicKey);
      const senderTokenBalanceBefore = await spl.getAccount(provider.connection, senderTA);

      let config = await mailbox.account.config.fetch(mailboxConfigPDA);
      let recipient = Buffer.from(sha256("recipient"), "hex");
      let recipientBz = Array.from(Uint8Array.from(recipient));
      let senderBz = Array.from(Uint8Array.from(user.publicKey.toBuffer()));
      const outboundMessagePDA = PublicKey.findProgramAddressSync(
        [Buffer.from("outbound_message"), config.globalNonce.toArrayLike(Buffer, "be", 8)],
        mailbox.programId
      )[0];

      const amountToSend = 2000;

      await bridge.methods
        .deposit(senderBz, recipientBz, foreignCallerBytes, new BN(amountToSend), null)
        .accountsPartial({
          sender: sender.publicKey, //token pool
          senderTokenAccount: senderTA, //token pool
          tokenProgram: spl.TOKEN_PROGRAM_ID,
          config: bridgeConfigPDA,
          senderConfig: senderConfigPDA,
          remoteBridgeConfig: remoteBridgeConfigPDA,
          localTokenConfig: localTokenConfigPDA,
          remoteTokenConfig: remoteTokenConfigPDA11,
          mint: mint,
          mailbox: mailbox.programId,
          mailboxConfig: mailboxConfigPDA,
          outboundMessage: outboundMessagePDA,
          outboundMessagePath: outboundMessagePathPDA,
          mailboxSenderConfig: bridgeSenderConfigPDA,
          treasury: treasury.publicKey
        })
        .signers([sender])
        .rpc({ commitment: "confirmed" });

      const expectedBody = new BridgePayload(foreignToken, user.publicKey.toBytes(), recipient, amountToSend);
      const expecedGmpMessage = messageV1(
        Buffer.from(outboundMessagePathBytes),
        config.globalNonce.toNumber(),
        bridge.programId.toBuffer(),
        Buffer.from(foreignBridgeAddressBytes),
        foreignCaller,
        expectedBody.bytes(),
      );

      const outboundMessageAccount = await provider.connection.getAccountInfo(outboundMessagePDA);
      expect(outboundMessageAccount.data).to.deep.eq(expecedGmpMessage)

      const expectedFee = feePerByte.muln(bridgeMessageLength).muln(40).divn(100);
      const treasurySolBalanceAfter = await provider.connection.getBalance(treasury.publicKey);
      expect(treasurySolBalanceAfter - treasurySolBalanceBefore).to.be.eq(expectedFee.toNumber());

      const tokenBalanceAfter = await spl.getAccount(provider.connection, senderTA);
      expect(senderTokenBalanceBefore.amount - tokenBalanceAfter.amount).to.be.equal(BigInt(amountToSend));
    });

    it("set 100% discount - bridging is fee free", async () => {
      await bridge.methods
        .setSenderConfig(sender.publicKey, new BN(10000), true)
        .accounts({
          admin: admin.publicKey
        })
        .signers([admin])
        .rpc({ commitment: "confirmed" });
    });

    const args = [
      {
        name: "tokens when fee is disabled",
        senderTA: () => senderTA,
        mint: () => mint,
        foreignToken: () => foreignToken,
        remoteBridgeConfig: () => remoteBridgeConfigPDA,
        localTokenConfig: () => localTokenConfigPDA,
        remoteTokenConfig: () => remoteTokenConfigPDA11,
        outboundMessagePath: () => outboundMessagePathBytes,
        outboundMessagePathPDA: () => outboundMessagePathPDA
      },
      {
        name: "token_2 to chain_1",
        senderTA: () => senderTA2,
        mint: () => mint2,
        foreignToken: () => foreignToken2,
        remoteBridgeConfig: () => remoteBridgeConfigPDA,
        localTokenConfig: () => localTokenConfigPDA2,
        remoteTokenConfig: () => remoteTokenConfigPDA12,
        outboundMessagePath: () => outboundMessagePathBytes,
        outboundMessagePathPDA: () => outboundMessagePathPDA
      },
      {
        name: "token_1 to chain_2",
        senderTA: () => senderTA,
        mint: () => mint,
        foreignToken: () => foreignToken,
        remoteBridgeConfig: () => remoteBridgeConfigPDA2,
        localTokenConfig: () => localTokenConfigPDA,
        remoteTokenConfig: () => remoteTokenConfigPDA21,
        outboundMessagePath: () => outboundMessagePathBytes2,
        outboundMessagePathPDA: () => outboundMessagePathPDA2
      },
      {
        name: "token_2 to chain_2",
        senderTA: () => senderTA2,
        mint: () => mint2,
        foreignToken: () => foreignToken2,
        remoteBridgeConfig: () => remoteBridgeConfigPDA2,
        localTokenConfig: () => localTokenConfigPDA2,
        remoteTokenConfig: () => remoteTokenConfigPDA22,
        outboundMessagePath: () => outboundMessagePathBytes2,
        outboundMessagePathPDA: () => outboundMessagePathPDA2
      }
    ];

    args.forEach(function (arg) {
      it(`send ${arg.name}`, async () => {
        const treasurySolBalanceBefore = await provider.connection.getBalance(treasury.publicKey);
        const senderTokenBalanceBefore = await spl.getAccount(provider.connection, arg.senderTA());

        let config = await mailbox.account.config.fetch(mailboxConfigPDA);
        let recipient = Buffer.from(sha256("recipient"), "hex");
        let recipientBz = Array.from(Uint8Array.from(recipient));
        let senderBz = Array.from(Uint8Array.from(user.publicKey.toBuffer()));
        const outboundMessagePDA = PublicKey.findProgramAddressSync(
          [Buffer.from("outbound_message"), config.globalNonce.toArrayLike(Buffer, "be", 8)],
          mailbox.programId
        )[0];

        const amountToSend = 2000;

        await bridge.methods
          .deposit(senderBz, recipientBz, foreignCallerBytes, new BN(amountToSend), null)
          .accountsPartial({
            mailbox: mailbox.programId,
            mailboxConfig: mailboxConfigPDA,
            sender: sender.publicKey,
            senderTokenAccount: arg.senderTA(),
            mailboxSenderConfig: bridgeSenderConfigPDA,
            config: bridgeConfigPDA,
            tokenProgram: spl.TOKEN_PROGRAM_ID,
            senderConfig: senderConfigPDA,

            outboundMessagePath: arg.outboundMessagePathPDA(),
            outboundMessage: outboundMessagePDA,
            remoteBridgeConfig: arg.remoteBridgeConfig(),
            localTokenConfig: arg.localTokenConfig(),
            remoteTokenConfig: arg.remoteTokenConfig(),
            mint: arg.mint(),

            treasury: treasury.publicKey
          })
          .signers([sender])
          .rpc({ commitment: "confirmed" });

        const expectedBody = new BridgePayload(arg.foreignToken(), user.publicKey.toBytes(), recipient, amountToSend);
        const expecedGmpMessage = messageV1(
          Buffer.from(arg.outboundMessagePath()),
          config.globalNonce.toNumber(),
          bridge.programId.toBuffer(),
          Buffer.from(foreignBridgeAddressBytes),
          foreignCaller,
          expectedBody.bytes(),
        );

        const outboundMessageAccount = await provider.connection.getAccountInfo(outboundMessagePDA);
        expect(outboundMessageAccount.data).to.deep.eq(expecedGmpMessage)

        const treasurySolBalanceAfter = await provider.connection.getBalance(treasury.publicKey);
        expect(treasurySolBalanceAfter - treasurySolBalanceBefore).to.be.eq(0);

        const tokenBalanceAfter = await spl.getAccount(provider.connection, arg.senderTA());
        expect(senderTokenBalanceBefore.amount - tokenBalanceAfter.amount).to.be.equal(BigInt(amountToSend));
      });
    });
  });

  describe("Pause", () => {
    it("Grant pauser role", async () => {
      await bridge.methods
        .grantAccountRole(pauser.publicKey, { pauser: {} })
        .accounts({
          admin: admin.publicKey
        })
        .signers([admin])
        .rpc({ commitment: "confirmed" });
      const accountRoles = await bridge.account.accountRoles.fetch(accountRolesPauserPDA);
      expect(accountRoles.roles).to.be.deep.eq([{ pauser: {} }]);
    });

    it("rejects when paused not by pauser", async () => {
      await expect(
        bridge.methods
          .pause()
          .accountsPartial({
            pauser: user.publicKey,
            config: bridgeConfigPDA,
            accountRoles: accountRolesPauserPDA
          })
          .signers([user])
          .rpc({ commitment: "confirmed" })
      ).to.be.rejectedWith("account_roles. Error Code: ConstraintSeeds");
    });

    it("pauser can set on pause", async () => {
      await bridge.methods
        .pause()
        .accountsPartial({
          pauser: pauser.publicKey,
          config: bridgeConfigPDA,
          accountRoles: accountRolesPauserPDA
        })
        .signers([pauser])
        .rpc({ commitment: "confirmed" });

      const cfg = await bridge.account.config.fetch(bridgeConfigPDA);
      expect(cfg.paused).to.be.true;
    });

    it("rejects when sending token_1", async () => {
      let config = await mailbox.account.config.fetch(mailboxConfigPDA);
      let recipient = Buffer.from(sha256("recipient"), "hex");
      let recipientBz = Array.from(Uint8Array.from(recipient));
      let senderBz = Array.from(Uint8Array.from(user.publicKey.toBuffer()));
      const outboundMessagePDA = PublicKey.findProgramAddressSync(
        [Buffer.from("outbound_message"), config.globalNonce.toArrayLike(Buffer, "be", 8)],
        mailbox.programId
      )[0];

      const amountToSend = 2000;

      await expect(
        bridge.methods
          .deposit(senderBz, recipientBz, foreignCallerBytes, new BN(amountToSend), null)
          .accountsPartial({
            sender: sender.publicKey,
            senderTokenAccount: senderTA,
            tokenProgram: spl.TOKEN_PROGRAM_ID,
            config: bridgeConfigPDA,
            senderConfig: senderConfigPDA,
            remoteBridgeConfig: remoteBridgeConfigPDA,
            localTokenConfig: localTokenConfigPDA,
            remoteTokenConfig: remoteTokenConfigPDA11,
            mint: mint,
            mailbox: mailbox.programId,
            mailboxConfig: mailboxConfigPDA,
            outboundMessage: outboundMessagePDA,
            outboundMessagePath: outboundMessagePathPDA,
            mailboxSenderConfig: bridgeSenderConfigPDA,
            treasury: treasury.publicKey
          })
          .signers([sender])
          .rpc({ commitment: "confirmed" })
      ).to.be.rejectedWith("Program is paused");
    });

    it("reject when receiving token_1", async () => {
      const amountToReceive = 2000;
      const bridgePayload = new BridgePayload(mint.toBytes(), remoteSenderBytes, userTA.toBytes(), amountToReceive);
      const message = messageV1(
        inboundMessagePath,
        nonceForeignChain++,
        foreignBridgeAddress,
        bridge.programId.toBuffer(),
        payer.publicKey.toBuffer(),
        bridgePayload.bytes()
      );

      const { payloadHash, payloadHashBytes } = await mailboxUtilities.deliverMessage(
        foreignMailboxAddress,
        foreignLchainId,
        payer,
        message
      );

      const receiverMessageHandledPDA = PublicKey.findProgramAddressSync(
        [Buffer.from("message_handled"), payloadHash],
        bridge.programId
      )[0];

      await expect(
        mailbox.methods
          .handleMessage(payloadHashBytes)
          .accounts({
            handler: payer.publicKey,
            recipientProgram: bridge.programId
          })
          .remainingAccounts([
            {
              pubkey: payer.publicKey,
              isWritable: true,
              isSigner: true
            },
            {
              pubkey: bridgeConfigPDA,
              isWritable: false,
              isSigner: false
            },
            {
              pubkey: receiverMessageHandledPDA,
              isWritable: true,
              isSigner: false
            },
            {
              // token_program
              pubkey: spl.TOKEN_PROGRAM_ID,
              isWritable: false,
              isSigner: false
            },
            {
              // recipient
              pubkey: userTA,
              isWritable: true,
              isSigner: false
            },
            {
              // mint
              pubkey: mint,
              isWritable: true,
              isSigner: false
            },
            {
              // mint_authority
              pubkey: multisig, // or tokenAuth
              isWritable: false,
              isSigner: false
            },
            {
              // token_authority
              pubkey: tokenAuth,
              isWritable: false,
              isSigner: false
            },
            {
              // remote_bridge_config
              pubkey: remoteBridgeConfigPDA,
              isWritable: false,
              isSigner: false
            },
            {
              // local_token_config
              pubkey: localTokenConfigPDA,
              isWritable: false,
              isSigner: false
            },
            {
              // remote_token_config
              pubkey: remoteTokenConfigPDA11,
              isWritable: true,
              isSigner: false
            },
            {
              // inbound_message_path
              pubkey: inboundMessagePathPDA,
              isWritable: false,
              isSigner: false
            },
            {
              pubkey: SystemProgram.programId,
              isWritable: false,
              isSigner: false
            }
          ])
          .signers([payer])
          .rpc({ commitment: "confirmed" })
      ).to.be.rejectedWith("Program is paused");
    });

    it("unpuase rejects when called not by admin", async () => {
      await expect(
        bridge.methods
          .unpause()
          .accountsPartial({
            admin: pauser.publicKey,
            config: bridgeConfigPDA
          })
          .signers([pauser])
          .rpc({ commitment: "confirmed" })
      ).to.be.rejectedWith("Unauthorized");
    });

    it("admin can disable pause", async () => {
      await bridge.methods
        .unpause()
        .accountsPartial({
          admin: admin.publicKey,
          config: bridgeConfigPDA
        })
        .signers([admin])
        .rpc({ commitment: "confirmed" });

      const cfg = await bridge.account.config.fetch(bridgeConfigPDA);
      expect(cfg.paused).to.be.false;
    });
  });

  describe("Send and receive tokens invalid cases", () => {
    describe("Remote bridge is deleted", () => {
      before("Delete remote bridge", async function () {
        await bridge.methods
          .unsetRemoteBridgeConfig(foreignLchainIdBytes)
          .accountsPartial({
            admin: admin.publicKey,
            config: bridgeConfigPDA,
            remoteBridgeConfig: remoteBridgeConfigPDA
          })
          .signers([admin])
          .rpc({ commitment: "confirmed" });
      });

      it("rejects when sending to chain_1", async () => {
        let config = await mailbox.account.config.fetch(mailboxConfigPDA);
        let recipient = Buffer.from(sha256("recipient"), "hex");
        let recipientBz = Array.from(Uint8Array.from(recipient));
        let senderBz = Array.from(Uint8Array.from(user.publicKey.toBuffer()));
        const outboundMessagePDA = PublicKey.findProgramAddressSync(
          [Buffer.from("outbound_message"), config.globalNonce.toArrayLike(Buffer, "be", 8)],
          mailbox.programId
        )[0];

        const amountToSend = 2000;

        await expect(
          bridge.methods
            .deposit(senderBz, recipientBz, foreignCallerBytes, new BN(amountToSend), null)
            .accountsPartial({
              sender: sender.publicKey,
              senderTokenAccount: senderTA,
              tokenProgram: spl.TOKEN_PROGRAM_ID,
              config: bridgeConfigPDA,
              senderConfig: senderConfigPDA,
              remoteBridgeConfig: remoteBridgeConfigPDA,
              localTokenConfig: localTokenConfigPDA,
              remoteTokenConfig: remoteTokenConfigPDA11,
              mint: mint,
              mailbox: mailbox.programId,
              mailboxConfig: mailboxConfigPDA,
              outboundMessage: outboundMessagePDA,
              outboundMessagePath: outboundMessagePathPDA,
              mailboxSenderConfig: bridgeSenderConfigPDA,
              treasury: treasury.publicKey
            })
            .signers([sender])
            .rpc({ commitment: "confirmed" })
        ).to.be.rejectedWith("remote_bridge_config. Error Code: AccountNotInitialized");
      });

      it("reject when receiving token_1", async () => {
        const amountToReceive = 2000;
        const bridgePayload = new BridgePayload(mint.toBytes(), remoteSenderBytes, userTA.toBytes(), amountToReceive);
        const message = messageV1(
          inboundMessagePath,
          nonceForeignChain++,
          foreignBridgeAddress,
          bridge.programId.toBuffer(),
          payer.publicKey.toBuffer(),
          bridgePayload.bytes()
        );

        const { payloadHash, payloadHashBytes } = await mailboxUtilities.deliverMessage(
          foreignMailboxAddress,
          foreignLchainId,
          payer,
          message
        );

        const receiverMessageHandledPDA = PublicKey.findProgramAddressSync(
          [Buffer.from("message_handled"), payloadHash],
          bridge.programId
        )[0];

        await expect(
          mailbox.methods
            .handleMessage(payloadHashBytes)
            .accounts({
              handler: payer.publicKey,
              recipientProgram: bridge.programId
            })
            .remainingAccounts([
              {
                pubkey: payer.publicKey,
                isWritable: true,
                isSigner: true
              },
              {
                pubkey: bridgeConfigPDA,
                isWritable: false,
                isSigner: false
              },
              {
                pubkey: receiverMessageHandledPDA,
                isWritable: true,
                isSigner: false
              },
              {
                // token_program
                pubkey: spl.TOKEN_PROGRAM_ID,
                isWritable: false,
                isSigner: false
              },
              {
                // recipient
                pubkey: userTA,
                isWritable: true,
                isSigner: false
              },
              {
                // mint
                pubkey: mint,
                isWritable: true,
                isSigner: false
              },
              {
                // mint_authority
                pubkey: multisig, // or tokenAuth
                isWritable: false,
                isSigner: false
              },
              {
                // token_authority
                pubkey: tokenAuth,
                isWritable: false,
                isSigner: false
              },
              {
                // remote_bridge_config
                pubkey: remoteBridgeConfigPDA,
                isWritable: false,
                isSigner: false
              },
              {
                // local_token_config
                pubkey: localTokenConfigPDA,
                isWritable: false,
                isSigner: false
              },
              {
                // remote_token_config
                pubkey: remoteTokenConfigPDA11,
                isWritable: true,
                isSigner: false
              },
              {
                // inbound_message_path
                pubkey: inboundMessagePathPDA,
                isWritable: false,
                isSigner: false
              },
              {
                pubkey: SystemProgram.programId,
                isWritable: false,
                isSigner: false
              }
            ])
            .signers([payer])
            .rpc({ commitment: "confirmed" })
        ).to.be.rejectedWith("remote_bridge_config. Error Code: AccountNotInitialized");
      });

      after("Enable remote bridge", async function () {
        await bridge.methods
          .setRemoteBridgeConfig(foreignLchainIdBytes, foreignBridgeAddressBytes)
          .accounts({
            admin: admin.publicKey
          })
          .signers([admin])
          .rpc({ commitment: "confirmed" });
      });
    });

    describe("Local token is deleted", () => {
      before("Delete local token_1", async function () {
        await bridge.methods
          .unsetLocalTokenConfig(mint)
          .accounts({
            admin: admin.publicKey
          })
          .signers([admin])
          .rpc({ commitment: "confirmed" });
      });

      it("rejects when sending token_1", async () => {
        let config = await mailbox.account.config.fetch(mailboxConfigPDA);
        let recipient = Buffer.from(sha256("recipient"), "hex");
        let recipientBz = Array.from(Uint8Array.from(recipient));
        let senderBz = Array.from(Uint8Array.from(user.publicKey.toBuffer()));
        const outboundMessagePDA = PublicKey.findProgramAddressSync(
          [Buffer.from("outbound_message"), config.globalNonce.toArrayLike(Buffer, "be", 8)],
          mailbox.programId
        )[0];

        const amountToSend = 2000;

        await expect(
          bridge.methods
            .deposit(senderBz, recipientBz, foreignCallerBytes, new BN(amountToSend), null)
            .accountsPartial({
              sender: sender.publicKey,
              senderTokenAccount: senderTA,
              tokenProgram: spl.TOKEN_PROGRAM_ID,
              config: bridgeConfigPDA,
              senderConfig: senderConfigPDA,
              remoteBridgeConfig: remoteBridgeConfigPDA,
              localTokenConfig: localTokenConfigPDA,
              remoteTokenConfig: remoteTokenConfigPDA11,
              mint: mint,
              mailbox: mailbox.programId,
              mailboxConfig: mailboxConfigPDA,
              outboundMessage: outboundMessagePDA,
              outboundMessagePath: outboundMessagePathPDA,
              mailboxSenderConfig: bridgeSenderConfigPDA,
              treasury: treasury.publicKey
            })
            .signers([sender])
            .rpc({ commitment: "confirmed" })
        ).to.be.rejectedWith("local_token_config. Error Code: AccountNotInitialized");
      });

      it("reject when receiving token_1", async () => {
        const amountToReceive = 2000;
        const bridgePayload = new BridgePayload(mint.toBytes(), remoteSenderBytes, userTA.toBytes(), amountToReceive);
        const message = messageV1(
          inboundMessagePath,
          nonceForeignChain++,
          foreignBridgeAddress,
          bridge.programId.toBuffer(),
          payer.publicKey.toBuffer(),
          bridgePayload.bytes()
        );

        const { payloadHash, payloadHashBytes } = await mailboxUtilities.deliverMessage(
          foreignMailboxAddress,
          foreignLchainId,
          payer,
          message
        );

        const receiverMessageHandledPDA = PublicKey.findProgramAddressSync(
          [Buffer.from("message_handled"), payloadHash],
          bridge.programId
        )[0];

        await expect(
          mailbox.methods
            .handleMessage(payloadHashBytes)
            .accounts({
              handler: payer.publicKey,
              recipientProgram: bridge.programId
            })
            .remainingAccounts([
              {
                pubkey: payer.publicKey,
                isWritable: true,
                isSigner: true
              },
              {
                pubkey: bridgeConfigPDA,
                isWritable: false,
                isSigner: false
              },
              {
                pubkey: receiverMessageHandledPDA,
                isWritable: true,
                isSigner: false
              },
              {
                // token_program
                pubkey: spl.TOKEN_PROGRAM_ID,
                isWritable: false,
                isSigner: false
              },
              {
                // recipient
                pubkey: userTA,
                isWritable: true,
                isSigner: false
              },
              {
                // mint
                pubkey: mint,
                isWritable: true,
                isSigner: false
              },
              {
                // mint_authority
                pubkey: multisig, // or tokenAuth
                isWritable: false,
                isSigner: false
              },
              {
                // token_authority
                pubkey: tokenAuth,
                isWritable: false,
                isSigner: false
              },
              {
                // remote_bridge_config
                pubkey: remoteBridgeConfigPDA,
                isWritable: false,
                isSigner: false
              },
              {
                // local_token_config
                pubkey: localTokenConfigPDA,
                isWritable: false,
                isSigner: false
              },
              {
                // remote_token_config
                pubkey: remoteTokenConfigPDA11,
                isWritable: true,
                isSigner: false
              },
              {
                // inbound_message_path
                pubkey: inboundMessagePathPDA,
                isWritable: false,
                isSigner: false
              },
              {
                pubkey: SystemProgram.programId,
                isWritable: false,
                isSigner: false
              }
            ])
            .signers([payer])
            .rpc({ commitment: "confirmed" })
        ).to.be.rejectedWith("local_token_config. Error Code: AccountNotInitialized");
      });

      after("Enable local token_1", async function () {
        await bridge.methods
          .setLocalTokenConfig(mint)
          .accounts({
            admin: admin.publicKey
          })
          .signers([admin])
          .rpc({ commitment: "confirmed" });
      });
    });

    describe("Remote token is deleted", () => {
      before("Delete remote config token_1 chain_1", async function () {
        await bridge.methods
          .unsetRemoteTokenConfig(mint, foreignLchainIdBytes)
          .accountsPartial({
            admin: admin.publicKey,
            config: bridgeConfigPDA,
            remoteTokenConfig: remoteTokenConfigPDA11
          })
          .signers([admin])
          .rpc({ commitment: "confirmed" });
      });

      it("rejects when sending token_1", async () => {
        let config = await mailbox.account.config.fetch(mailboxConfigPDA);
        let recipient = Buffer.from(sha256("recipient"), "hex");
        let recipientBz = Array.from(Uint8Array.from(recipient));
        let senderBz = Array.from(Uint8Array.from(user.publicKey.toBuffer()));
        const outboundMessagePDA = PublicKey.findProgramAddressSync(
          [Buffer.from("outbound_message"), config.globalNonce.toArrayLike(Buffer, "be", 8)],
          mailbox.programId
        )[0];

        const amountToSend = 2000;

        await expect(
          bridge.methods
            .deposit(senderBz, recipientBz, foreignCallerBytes, new BN(amountToSend), null)
            .accountsPartial({
              sender: sender.publicKey,
              senderTokenAccount: senderTA,
              tokenProgram: spl.TOKEN_PROGRAM_ID,
              config: bridgeConfigPDA,
              senderConfig: senderConfigPDA,
              remoteBridgeConfig: remoteBridgeConfigPDA,
              localTokenConfig: localTokenConfigPDA,
              remoteTokenConfig: remoteTokenConfigPDA11,
              mint: mint,
              mailbox: mailbox.programId,
              mailboxConfig: mailboxConfigPDA,
              outboundMessage: outboundMessagePDA,
              outboundMessagePath: outboundMessagePathPDA,
              mailboxSenderConfig: bridgeSenderConfigPDA,
              treasury: treasury.publicKey
            })
            .signers([sender])
            .rpc({ commitment: "confirmed" })
        ).to.be.rejectedWith("remote_token_config. Error Code: AccountNotInitialized");
      });

      it("reject when receiving token_1", async () => {
        const amountToReceive = 2000;
        const bridgePayload = new BridgePayload(mint.toBytes(), remoteSenderBytes, userTA.toBytes(), amountToReceive);
        const message = messageV1(
          inboundMessagePath,
          nonceForeignChain++,
          foreignBridgeAddress,
          bridge.programId.toBuffer(),
          payer.publicKey.toBuffer(),
          bridgePayload.bytes()
        );

        const { payloadHash, payloadHashBytes } = await mailboxUtilities.deliverMessage(
          foreignMailboxAddress,
          foreignLchainId,
          payer,
          message
        );

        const receiverMessageHandledPDA = PublicKey.findProgramAddressSync(
          [Buffer.from("message_handled"), payloadHash],
          bridge.programId
        )[0];

        await expect(
          mailbox.methods
            .handleMessage(payloadHashBytes)
            .accounts({
              handler: payer.publicKey,
              recipientProgram: bridge.programId
            })
            .remainingAccounts([
              {
                pubkey: payer.publicKey,
                isWritable: true,
                isSigner: true
              },
              {
                pubkey: bridgeConfigPDA,
                isWritable: false,
                isSigner: false
              },
              {
                pubkey: receiverMessageHandledPDA,
                isWritable: true,
                isSigner: false
              },
              {
                // token_program
                pubkey: spl.TOKEN_PROGRAM_ID,
                isWritable: false,
                isSigner: false
              },
              {
                // recipient
                pubkey: userTA,
                isWritable: true,
                isSigner: false
              },
              {
                // mint
                pubkey: mint,
                isWritable: true,
                isSigner: false
              },
              {
                // mint_authority
                pubkey: multisig, // or tokenAuth
                isWritable: false,
                isSigner: false
              },
              {
                // token_authority
                pubkey: tokenAuth,
                isWritable: false,
                isSigner: false
              },
              {
                // remote_bridge_config
                pubkey: remoteBridgeConfigPDA,
                isWritable: false,
                isSigner: false
              },
              {
                // local_token_config
                pubkey: localTokenConfigPDA,
                isWritable: false,
                isSigner: false
              },
              {
                // remote_token_config
                pubkey: remoteTokenConfigPDA11,
                isWritable: true,
                isSigner: false
              },
              {
                // inbound_message_path
                pubkey: inboundMessagePathPDA,
                isWritable: false,
                isSigner: false
              },
              {
                pubkey: SystemProgram.programId,
                isWritable: false,
                isSigner: false
              }
            ])
            .signers([payer])
            .rpc({ commitment: "confirmed" })
        ).to.be.rejectedWith("remote_token_config. Error Code: AccountNotInitialized");
      });

      after("Enable remote token_1 chain_1", async () => {
        await bridge.methods
          .setRemoteTokenConfig(mint, foreignLchainIdBytes, foreignTokenBytes, 3)
          .accounts({
            admin: admin.publicKey
          })
          .signers([admin])
          .rpc({ commitment: "confirmed" });
      });
    });

    describe("Remote token is disabled", () => {
      before("Disable remote token_1 chain_1", async function () {
        await bridge.methods
          .setRemoteTokenConfig(mint, foreignLchainIdBytes, foreignTokenBytes, 0)
          .accounts({
            admin: admin.publicKey
          })
          .signers([admin])
          .rpc({ commitment: "confirmed" });
      });

      it("rejects when sending token_1", async () => {
        let config = await mailbox.account.config.fetch(mailboxConfigPDA);
        let recipient = Buffer.from(sha256("recipient"), "hex");
        let recipientBz = Array.from(Uint8Array.from(recipient));
        let senderBz = Array.from(Uint8Array.from(user.publicKey.toBuffer()));
        const outboundMessagePDA = PublicKey.findProgramAddressSync(
          [Buffer.from("outbound_message"), config.globalNonce.toArrayLike(Buffer, "be", 8)],
          mailbox.programId
        )[0];

        const amountToSend = 2000;

        await expect(
          bridge.methods
            .deposit(senderBz, recipientBz, foreignCallerBytes, new BN(amountToSend), null)
            .accountsPartial({
              sender: sender.publicKey,
              senderTokenAccount: senderTA,
              tokenProgram: spl.TOKEN_PROGRAM_ID,
              config: bridgeConfigPDA,
              senderConfig: senderConfigPDA,
              remoteBridgeConfig: remoteBridgeConfigPDA,
              localTokenConfig: localTokenConfigPDA,
              remoteTokenConfig: remoteTokenConfigPDA11,
              mint: mint,
              mailbox: mailbox.programId,
              mailboxConfig: mailboxConfigPDA,
              outboundMessage: outboundMessagePDA,
              outboundMessagePath: outboundMessagePathPDA,
              mailboxSenderConfig: bridgeSenderConfigPDA,
              treasury: treasury.publicKey
            })
            .signers([sender])
            .rpc({ commitment: "confirmed" })
        ).to.be.rejectedWith("remote_token_config. Error Code: OutboundDirectionDisabled");
      });

      it("reject when receiving token_1", async () => {
        const amountToReceive = 2000;
        const bridgePayload = new BridgePayload(mint.toBytes(), remoteSenderBytes, userTA.toBytes(), amountToReceive);
        const message = messageV1(
          inboundMessagePath,
          nonceForeignChain++,
          foreignBridgeAddress,
          bridge.programId.toBuffer(),
          payer.publicKey.toBuffer(),
          bridgePayload.bytes()
        );

        const { payloadHash, payloadHashBytes } = await mailboxUtilities.deliverMessage(
          foreignMailboxAddress,
          foreignLchainId,
          payer,
          message
        );

        const receiverMessageHandledPDA = PublicKey.findProgramAddressSync(
          [Buffer.from("message_handled"), payloadHash],
          bridge.programId
        )[0];

        await expect(
          mailbox.methods
            .handleMessage(payloadHashBytes)
            .accounts({
              handler: payer.publicKey,
              recipientProgram: bridge.programId
            })
            .remainingAccounts([
              {
                pubkey: payer.publicKey,
                isWritable: true,
                isSigner: true
              },
              {
                pubkey: bridgeConfigPDA,
                isWritable: false,
                isSigner: false
              },
              {
                pubkey: receiverMessageHandledPDA,
                isWritable: true,
                isSigner: false
              },
              {
                // token_program
                pubkey: spl.TOKEN_PROGRAM_ID,
                isWritable: false,
                isSigner: false
              },
              {
                // recipient
                pubkey: userTA,
                isWritable: true,
                isSigner: false
              },
              {
                // mint
                pubkey: mint,
                isWritable: true,
                isSigner: false
              },
              {
                // mint_authority
                pubkey: multisig, // or tokenAuth
                isWritable: false,
                isSigner: false
              },
              {
                // token_authority
                pubkey: tokenAuth,
                isWritable: false,
                isSigner: false
              },
              {
                // remote_bridge_config
                pubkey: remoteBridgeConfigPDA,
                isWritable: false,
                isSigner: false
              },
              {
                // local_token_config
                pubkey: localTokenConfigPDA,
                isWritable: false,
                isSigner: false
              },
              {
                // remote_token_config
                pubkey: remoteTokenConfigPDA11,
                isWritable: true,
                isSigner: false
              },
              {
                // inbound_message_path
                pubkey: inboundMessagePathPDA,
                isWritable: false,
                isSigner: false
              },
              {
                pubkey: SystemProgram.programId,
                isWritable: false,
                isSigner: false
              }
            ])
            .signers([payer])
            .rpc({ commitment: "confirmed" })
        ).to.be.rejectedWith("remote_token_config. Error Code: InboundDirectionDisabled");
      });

      after("Enable remote token_1 chain_1", async () => {
        await bridge.methods
          .setRemoteTokenConfig(mint, foreignLchainIdBytes, foreignTokenBytes, 3)
          .accounts({
            admin: admin.publicKey
          })
          .signers([admin])
          .rpc({ commitment: "confirmed" });
      });
    });

    describe("Sender config is deleted", () => {
      before("Delete sender config", async function () {
        await bridge.methods
          .unsetSenderConfig(sender.publicKey)
          .accountsPartial({
            admin: admin.publicKey,
            config: bridgeConfigPDA,
            senderConfig: senderConfigPDA
          })
          .signers([admin])
          .rpc({ commitment: "confirmed" });
      });

      it("rejects when sending to chain_1", async () => {
        let config = await mailbox.account.config.fetch(mailboxConfigPDA);
        let recipient = Buffer.from(sha256("recipient"), "hex");
        let recipientBz = Array.from(Uint8Array.from(recipient));
        let senderBz = Array.from(Uint8Array.from(user.publicKey.toBuffer()));
        const outboundMessagePDA = PublicKey.findProgramAddressSync(
          [Buffer.from("outbound_message"), config.globalNonce.toArrayLike(Buffer, "be", 8)],
          mailbox.programId
        )[0];

        const amountToSend = 2000;

        await expect(
          bridge.methods
            .deposit(senderBz, recipientBz, foreignCallerBytes, new BN(amountToSend), null)
            .accountsPartial({
              sender: sender.publicKey,
              senderTokenAccount: senderTA,
              tokenProgram: spl.TOKEN_PROGRAM_ID,
              config: bridgeConfigPDA,
              senderConfig: senderConfigPDA,
              remoteBridgeConfig: remoteBridgeConfigPDA,
              localTokenConfig: localTokenConfigPDA,
              remoteTokenConfig: remoteTokenConfigPDA11,
              mint: mint,
              mailbox: mailbox.programId,
              mailboxConfig: mailboxConfigPDA,
              outboundMessage: outboundMessagePDA,
              outboundMessagePath: outboundMessagePathPDA,
              mailboxSenderConfig: bridgeSenderConfigPDA,
              treasury: treasury.publicKey
            })
            .signers([sender])
            .rpc({ commitment: "confirmed" })
        ).to.be.rejectedWith("sender_config. Error Code: AccountNotInitialized");
      });

      after("Set sender config", async function () {
        await bridge.methods
          .setSenderConfig(sender.publicKey, new BN(0), true)
          .accounts({
            admin: admin.publicKey
          })
          .signers([admin])
          .rpc({ commitment: "confirmed" });
      });
    });

    describe("Receive tokens with invalid params", () => {
      const args = [
        // {
        //   name: "valid",
        //   inboundMessagePath: () => inboundMessagePath,
        //   inboundMessagePathPDA: () => inboundMessagePathPDA,
        //   fromChainId: () => foreignLchainId,
        //   foreignBridgeAddress: () => foreignBridgeAddress,
        //
        //   remoteBridgeConfigPDA: () => remoteBridgeConfigPDA,
        //   remoteTokenConfigPDA: () => remoteTokenConfigPDA11,
        //
        //   tokenToMint: () => mint.toBytes(),
        //   localToken: () => mint,
        //   localTokenConfig: () => localTokenConfigPDA,
        //
        //   receiverAddress: () => user.publicKey.toBytes(),
        //   receiverTokeAccount: () => userTA,
        //   error: "reason"
        // },
        {
          name: "invalid local token account",
          inboundMessagePath: () => inboundMessagePath,
          inboundMessagePathPDA: () => inboundMessagePathPDA,
          fromChainId: () => foreignLchainId,
          foreignBridgeAddress: () => foreignBridgeAddress,

          remoteBridgeConfigPDA: () => remoteBridgeConfigPDA,
          remoteTokenConfigPDA: () => remoteTokenConfigPDA11,

          tokenToMint: () => mint.toBytes(),
          localToken: () => mint2,
          localTokenConfig: () => localTokenConfigPDA,

          receiverAddress: () => user.publicKey.toBytes(),
          receiverTokeAccount: () => userTA,
          error: "token mint constraint was violated"
        },
        {
          name: "invalid local token config",
          inboundMessagePath: () => inboundMessagePath,
          inboundMessagePathPDA: () => inboundMessagePathPDA,
          fromChainId: () => foreignLchainId,
          foreignBridgeAddress: () => foreignBridgeAddress,

          remoteBridgeConfigPDA: () => remoteBridgeConfigPDA,
          remoteTokenConfigPDA: () => remoteTokenConfigPDA11,

          tokenToMint: () => mint.toBytes(),
          localToken: () => mint,
          localTokenConfig: () => localTokenConfigPDA2,

          receiverAddress: () => user.publicKey.toBytes(),
          receiverTokeAccount: () => userTA,
          error: "mint. Error Code: ConstraintAddress"
        },
        {
          name: "invalid remote bridge config",
          inboundMessagePath: () => inboundMessagePath,
          inboundMessagePathPDA: () => inboundMessagePathPDA,
          fromChainId: () => foreignLchainId,
          foreignBridgeAddress: () => foreignBridgeAddress,

          remoteBridgeConfigPDA: () => remoteBridgeConfigPDA2,
          remoteTokenConfigPDA: () => remoteTokenConfigPDA11,

          tokenToMint: () => mint.toBytes(),
          localToken: () => mint,
          localTokenConfig: () => localTokenConfigPDA,

          receiverAddress: () => user.publicKey.toBytes(),
          receiverTokeAccount: () => userTA,
          error: "remote_bridge_config. Error Code: ConstraintSeeds"
        },
        {
          name: "invalid remote token config",
          inboundMessagePath: () => inboundMessagePath,
          inboundMessagePathPDA: () => inboundMessagePathPDA,
          fromChainId: () => foreignLchainId,
          foreignBridgeAddress: () => foreignBridgeAddress,

          remoteBridgeConfigPDA: () => remoteBridgeConfigPDA,
          remoteTokenConfigPDA: () => remoteTokenConfigPDA12,

          tokenToMint: () => mint.toBytes(),
          localToken: () => mint,
          localTokenConfig: () => localTokenConfigPDA,

          receiverAddress: () => user.publicKey.toBytes(),
          receiverTokeAccount: () => userTA,
          error: "remote_token_config. Error Code: ConstraintSeeds"
        },
        {
          name: "invalid receiver TA account",
          inboundMessagePath: () => inboundMessagePath,
          inboundMessagePathPDA: () => inboundMessagePathPDA,
          fromChainId: () => foreignLchainId,
          foreignBridgeAddress: () => foreignBridgeAddress,

          remoteBridgeConfigPDA: () => remoteBridgeConfigPDA,
          remoteTokenConfigPDA: () => remoteTokenConfigPDA11,

          tokenToMint: () => mint.toBytes(),
          localToken: () => mint,
          localTokenConfig: () => localTokenConfigPDA,

          receiverAddress: () => user.publicKey.toBytes(),
          receiverTokeAccount: () => userTA2,
          error: "ConstraintTokenMint"
        },
        {
          name: "TA belongs other user",
          inboundMessagePath: () => inboundMessagePath,
          inboundMessagePathPDA: () => inboundMessagePathPDA,
          fromChainId: () => foreignLchainId,
          foreignBridgeAddress: () => foreignBridgeAddress,

          remoteBridgeConfigPDA: () => remoteBridgeConfigPDA,
          remoteTokenConfigPDA: () => remoteTokenConfigPDA11,

          tokenToMint: () => mint.toBytes(),
          localToken: () => mint,
          localTokenConfig: () => localTokenConfigPDA,

          receiverAddress: () => admin.publicKey.toBytes(),
          receiverTokeAccount: () => userTA,
          error: "Mismatch between mint payload and passed account"
        },
        {
          name: "unknown remote bridge",
          inboundMessagePath: () => inboundMessagePath,
          inboundMessagePathPDA: () => inboundMessagePathPDA,
          fromChainId: () => foreignLchainId,
          foreignBridgeAddress: () => Buffer.from(sha256("unknown-bridge-address"), "hex"),

          remoteBridgeConfigPDA: () => remoteBridgeConfigPDA,
          remoteTokenConfigPDA: () => remoteTokenConfigPDA11,

          tokenToMint: () => mint.toBytes(),
          localToken: () => mint,
          localTokenConfig: () => localTokenConfigPDA,

          receiverAddress: () => user.publicKey.toBytes(),
          receiverTokeAccount: () => userTA,
          error: "remote_bridge_config. Error Code: ConstraintRaw"
        }
      ];

      args.forEach(function (arg) {
        it(`receive ${arg.name}`, async () => {
          const bridgePayload = new BridgePayload(arg.tokenToMint(), remoteSenderBytes, arg.receiverAddress(), 1000);
          const message = messageV1(
            arg.inboundMessagePath(),
            nonceForeignChain++,
            arg.foreignBridgeAddress(),
            bridge.programId.toBuffer(),
            payer.publicKey.toBuffer(),
            bridgePayload.bytes()
          );

          const { payloadHash, payloadHashBytes } = await mailboxUtilities.deliverMessage(
            foreignMailboxAddress,
            arg.fromChainId(),
            payer,
            message
          );

          const receiverMessageHandledPDA = PublicKey.findProgramAddressSync(
            [Buffer.from("message_handled"), payloadHash],
            bridge.programId
          )[0];

          await expect(
            mailbox.methods
              .handleMessage(payloadHashBytes)
              .accounts({
                handler: payer.publicKey,
                recipientProgram: bridge.programId
              })
              .remainingAccounts([
                {
                  pubkey: payer.publicKey,
                  isWritable: true,
                  isSigner: true
                },
                {
                  pubkey: bridgeConfigPDA,
                  isWritable: false,
                  isSigner: false
                },
                {
                  pubkey: receiverMessageHandledPDA,
                  isWritable: true,
                  isSigner: false
                },
                {
                  // token_program
                  pubkey: spl.TOKEN_PROGRAM_ID,
                  isWritable: false,
                  isSigner: false
                },
                {
                  // recipient
                  pubkey: arg.receiverTokeAccount(),
                  isWritable: true,
                  isSigner: false
                },
                {
                  // mint
                  pubkey: arg.localToken(),
                  isWritable: true,
                  isSigner: false
                },
                {
                  // mint_authority
                  pubkey: multisig, // or tokenAuth
                  isWritable: false,
                  isSigner: false
                },
                {
                  // token_authority
                  pubkey: tokenAuth,
                  isWritable: false,
                  isSigner: false
                },
                {
                  // remote_bridge_config
                  pubkey: arg.remoteBridgeConfigPDA(),
                  isWritable: false,
                  isSigner: false
                },
                {
                  // local_token_config
                  pubkey: arg.localTokenConfig(),
                  isWritable: false,
                  isSigner: false
                },
                {
                  // remote_token_config
                  pubkey: arg.remoteTokenConfigPDA(),
                  isWritable: true,
                  isSigner: false
                },
                {
                  // inbound_message_path
                  pubkey: arg.inboundMessagePathPDA(),
                  isWritable: false,
                  isSigner: false
                },
                {
                  pubkey: SystemProgram.programId,
                  isWritable: false,
                  isSigner: false
                }
              ])
              .signers([payer])
              .rpc({ commitment: "confirmed" })
          ).to.be.rejectedWith(arg.error);
        });
      });
    });

    describe("Send tokens with invalid params", () => {
      const args = [
        // {
        //   name: "valid",
        //   sender: () => tokenPool,
        //   senderTA: () => tokenPoolTA,
        //   mint: () => mint,
        //   remoteBridgeConfig: () => remoteBridgeConfigPDA,
        //   localTokenConfig: () => localTokenConfigPDA,
        //   remoteTokenConfig: () => remoteTokenConfigPDA11,
        //   outboundMessagePath: () => outboundMessagePathBytes,
        //   outboundMessagePathPDA: () => outboundMessagePathPDA,
        //   error: "reason"
        // },
        {
          name: "invalid sender config",
          sender: () => user,
          senderTA: () => userTA,
          mint: () => mint,
          remoteBridgeConfig: () => remoteBridgeConfigPDA,
          localTokenConfig: () => localTokenConfigPDA,
          remoteTokenConfig: () => remoteTokenConfigPDA11,
          outboundMessagePath: () => outboundMessagePathBytes,
          outboundMessagePathPDA: () => outboundMessagePathPDA,
          error: "sender_config. Error Code: ConstraintSeeds"
        },
        {
          name: "invalid remote bridge config",
          sender: () => sender,
          senderTA: () => senderTA,
          mint: () => mint,
          remoteBridgeConfig: () => remoteBridgeConfigPDA2,
          localTokenConfig: () => localTokenConfigPDA,
          remoteTokenConfig: () => remoteTokenConfigPDA11,
          outboundMessagePath: () => outboundMessagePathBytes,
          outboundMessagePathPDA: () => outboundMessagePathPDA,
          error: "remote_bridge_config. Error Code: ConstraintSeeds"
        },
        {
          name: "invalid remote token config",
          sender: () => sender,
          senderTA: () => senderTA,
          mint: () => mint,
          remoteBridgeConfig: () => remoteBridgeConfigPDA,
          localTokenConfig: () => localTokenConfigPDA,
          remoteTokenConfig: () => remoteTokenConfigPDA12,
          outboundMessagePath: () => outboundMessagePathBytes,
          outboundMessagePathPDA: () => outboundMessagePathPDA,
          error: "remote_token_config. Error Code: ConstraintSeeds"
        },
        {
          name: "invalid local token config",
          sender: () => sender,
          senderTA: () => senderTA,
          mint: () => mint,
          remoteBridgeConfig: () => remoteBridgeConfigPDA,
          localTokenConfig: () => localTokenConfigPDA2,
          remoteTokenConfig: () => remoteTokenConfigPDA11,
          outboundMessagePath: () => outboundMessagePathBytes,
          outboundMessagePathPDA: () => outboundMessagePathPDA,
          error: "local_token_config. Error Code: ConstraintSeeds"
        }
      ];

      args.forEach(function (arg) {
        it(`send ${arg.name}`, async () => {
          let config = await mailbox.account.config.fetch(mailboxConfigPDA);
          let recipient = Buffer.from(sha256("recipient"), "hex");
          let recipientBz = Array.from(Uint8Array.from(recipient));
          let senderBz = Array.from(Uint8Array.from(user.publicKey.toBuffer()));
          const outboundMessagePDA = PublicKey.findProgramAddressSync(
            [Buffer.from("outbound_message"), config.globalNonce.toArrayLike(Buffer, "be", 8)],
            mailbox.programId
          )[0];

          const amountToSend = 2000;

          await expect(
            bridge.methods
              .deposit(senderBz, recipientBz, foreignCallerBytes, new BN(amountToSend), null)
              .accountsPartial({
                mailbox: mailbox.programId,
                mailboxConfig: mailboxConfigPDA,
                sender: arg.sender().publicKey,
                senderTokenAccount: arg.senderTA(),
                mailboxSenderConfig: bridgeSenderConfigPDA,
                config: bridgeConfigPDA,
                tokenProgram: spl.TOKEN_PROGRAM_ID,
                senderConfig: senderConfigPDA,

                outboundMessagePath: arg.outboundMessagePathPDA(),
                outboundMessage: outboundMessagePDA,
                remoteBridgeConfig: arg.remoteBridgeConfig(),
                remoteTokenConfig: arg.remoteTokenConfig(),
                localTokenConfig: arg.localTokenConfig(),
                mint: arg.mint(),

                treasury: treasury.publicKey
              })
              .signers([arg.sender()])
              .rpc({ commitment: "confirmed" })
          ).to.be.rejectedWith(arg.error);
        });
      });
    });
  });

  describe("Rate limit is only for incoming bridges", () => {
    const bridgeCapacity = 1500;
    const recoveryRate = 100; //100 a second

    it("enable rate limit for token_1 from chain_1", async function () {
      await bridge.methods
        .setRateLimit(mint, foreignLchainIdBytes, {
          rate: new BN(recoveryRate),
          capacity: new BN(bridgeCapacity),
          enabled: true
        })
        .accountsPartial({
          admin: admin.publicKey,
          config: bridgeConfigPDA,
          remoteTokenConfig: remoteTokenConfigPDA11
        })
        .signers([admin])
        .rpc({ commitment: "confirmed" });

      const timeNow = Math.round(Date.now() / 1000);

      let bridgeRemoteTokenConfig = await bridge.account.remoteTokenConfig.fetch(remoteTokenConfigPDA11);

      expect(bridgeRemoteTokenConfig.chainId).to.be.deep.eq(foreignLchainIdBytes);
      expect(bridgeRemoteTokenConfig.inboundRateLimit.tokens.toNumber()).to.eq(bridgeCapacity);
      expect(bridgeRemoteTokenConfig.inboundRateLimit.lastUpdated.toNumber()).to.closeTo(timeNow, 2);
      expect(bridgeRemoteTokenConfig.inboundRateLimit.cfg.enabled).to.be.true;
      expect(bridgeRemoteTokenConfig.inboundRateLimit.cfg.capacity.toNumber()).to.be.eq(bridgeCapacity);
      expect(bridgeRemoteTokenConfig.inboundRateLimit.cfg.rate.toNumber()).to.be.eq(recoveryRate);
    });

    it("receive tokens < limit", async () => {
      const amountToReceive = bridgeCapacity / 2;
      const bridgePayload = new BridgePayload(mint.toBytes(), remoteSenderBytes, userTA.toBytes(), amountToReceive);
      const message = messageV1(
        inboundMessagePath,
        nonceForeignChain++,
        foreignBridgeAddress,
        bridge.programId.toBuffer(),
        payer.publicKey.toBuffer(),
        bridgePayload.bytes()
      );

      const { payloadHash, payloadHashBytes } = await mailboxUtilities.deliverMessage(
        foreignMailboxAddress,
        foreignLchainId,
        payer,
        message
      );
      const tokenBalanceBefore = await spl.getAccount(provider.connection, userTA);

      // a PDA the test receiver program uses to track if the message has been handled
      const receiverMessageHandledPDA = PublicKey.findProgramAddressSync(
        [Buffer.from("message_handled"), payloadHash],
        bridge.programId
      )[0];

      await mailbox.methods
        .handleMessage(payloadHashBytes)
        .accounts({
          handler: payer.publicKey,
          recipientProgram: bridge.programId
        })
        .remainingAccounts([
          {
            pubkey: payer.publicKey,
            isWritable: true,
            isSigner: true
          },
          {
            pubkey: bridgeConfigPDA,
            isWritable: false,
            isSigner: false
          },
          {
            pubkey: receiverMessageHandledPDA,
            isWritable: true,
            isSigner: false
          },
          {
            // token_program
            pubkey: spl.TOKEN_PROGRAM_ID,
            isWritable: false,
            isSigner: false
          },
          {
            // recipient
            pubkey: userTA,
            isWritable: true,
            isSigner: false
          },
          {
            // mint
            pubkey: mint,
            isWritable: true,
            isSigner: false
          },
          {
            // mint_authority
            pubkey: multisig, // or tokenAuth
            isWritable: false,
            isSigner: false
          },
          {
            // token_authority
            pubkey: tokenAuth,
            isWritable: false,
            isSigner: false
          },
          {
            // remote_bridge_config
            pubkey: remoteBridgeConfigPDA,
            isWritable: false,
            isSigner: false
          },
          {
            // local_token_config
            pubkey: localTokenConfigPDA,
            isWritable: false,
            isSigner: false
          },
          {
            // remote_token_config
            pubkey: remoteTokenConfigPDA11,
            isWritable: true,
            isSigner: false
          },
          {
            // inbound_message_path
            pubkey: inboundMessagePathPDA,
            isWritable: false,
            isSigner: false
          },
          {
            pubkey: SystemProgram.programId,
            isWritable: false,
            isSigner: false
          }
        ])
        .signers([payer])
        .rpc({ commitment: "confirmed" });
      const timeNow = Math.round(Date.now() / 1000);

      const tokenBalanceAfter = await spl.getAccount(provider.connection, userTA);
      expect(tokenBalanceAfter.amount).to.be.equal(tokenBalanceBefore.amount + BigInt(amountToReceive));

      let bridgeRemoteTokenConfig = await bridge.account.remoteTokenConfig.fetch(remoteTokenConfigPDA11);

      expect(bridgeRemoteTokenConfig.chainId).to.be.deep.eq(foreignLchainIdBytes);
      expect(bridgeRemoteTokenConfig.inboundRateLimit.tokens.toNumber()).to.eq(bridgeCapacity - amountToReceive);
      expect(bridgeRemoteTokenConfig.inboundRateLimit.lastUpdated.toNumber()).to.closeTo(timeNow, 2);
      expect(bridgeRemoteTokenConfig.inboundRateLimit.cfg.enabled).to.be.true;
      expect(bridgeRemoteTokenConfig.inboundRateLimit.cfg.capacity.toNumber()).to.be.eq(bridgeCapacity);
      expect(bridgeRemoteTokenConfig.inboundRateLimit.cfg.rate.toNumber()).to.be.eq(recoveryRate);
    });

    it("receive tokens and spend all limit", async () => {
      let bridgeRemoteTokenConfigBefore = await bridge.account.remoteTokenConfig.fetch(remoteTokenConfigPDA11);
      const amountToReceive = bridgeRemoteTokenConfigBefore.inboundRateLimit.tokens.toNumber();
      const bridgePayload = new BridgePayload(mint.toBytes(), remoteSenderBytes, userTA.toBytes(), amountToReceive);
      const message = messageV1(
        inboundMessagePath,
        nonceForeignChain++,
        foreignBridgeAddress,
        bridge.programId.toBuffer(),
        payer.publicKey.toBuffer(),
        bridgePayload.bytes()
      );

      const { payloadHash, payloadHashBytes } = await mailboxUtilities.deliverMessage(
        foreignMailboxAddress,
        foreignLchainId,
        payer,
        message
      );
      const tokenBalanceBefore = await spl.getAccount(provider.connection, userTA);

      // a PDA the test receiver program uses to track if the message has been handled
      const receiverMessageHandledPDA = PublicKey.findProgramAddressSync(
        [Buffer.from("message_handled"), payloadHash],
        bridge.programId
      )[0];

      await mailbox.methods
        .handleMessage(payloadHashBytes)
        .accounts({
          handler: payer.publicKey,
          recipientProgram: bridge.programId
        })
        .remainingAccounts([
          {
            pubkey: payer.publicKey,
            isWritable: true,
            isSigner: true
          },
          {
            pubkey: bridgeConfigPDA,
            isWritable: false,
            isSigner: false
          },
          {
            pubkey: receiverMessageHandledPDA,
            isWritable: true,
            isSigner: false
          },
          {
            // token_program
            pubkey: spl.TOKEN_PROGRAM_ID,
            isWritable: false,
            isSigner: false
          },
          {
            // recipient
            pubkey: userTA,
            isWritable: true,
            isSigner: false
          },
          {
            // mint
            pubkey: mint,
            isWritable: true,
            isSigner: false
          },
          {
            // mint_authority
            pubkey: multisig, // or tokenAuth
            isWritable: false,
            isSigner: false
          },
          {
            // token_authority
            pubkey: tokenAuth,
            isWritable: false,
            isSigner: false
          },
          {
            // remote_bridge_config
            pubkey: remoteBridgeConfigPDA,
            isWritable: false,
            isSigner: false
          },
          {
            // local_token_config
            pubkey: localTokenConfigPDA,
            isWritable: false,
            isSigner: false
          },
          {
            // remote_token_config
            pubkey: remoteTokenConfigPDA11,
            isWritable: true,
            isSigner: false
          },
          {
            // inbound_message_path
            pubkey: inboundMessagePathPDA,
            isWritable: false,
            isSigner: false
          },
          {
            pubkey: SystemProgram.programId,
            isWritable: false,
            isSigner: false
          }
        ])
        .signers([payer])
        .rpc({ commitment: "confirmed" });
      const timeNow = Math.round(Date.now() / 1000);

      const tokenBalanceAfter = await spl.getAccount(provider.connection, userTA);
      expect(tokenBalanceAfter.amount).to.be.equal(tokenBalanceBefore.amount + BigInt(amountToReceive));

      let bridgeRemoteTokenConfig = await bridge.account.remoteTokenConfig.fetch(remoteTokenConfigPDA11);

      expect(bridgeRemoteTokenConfig.chainId).to.be.deep.eq(foreignLchainIdBytes);
      expect(bridgeRemoteTokenConfig.inboundRateLimit.lastUpdated.toNumber()).to.closeTo(timeNow, 2);
      expect(bridgeRemoteTokenConfig.inboundRateLimit.cfg.enabled).to.be.true;
      expect(bridgeRemoteTokenConfig.inboundRateLimit.cfg.capacity.toNumber()).to.be.eq(bridgeCapacity);
      expect(bridgeRemoteTokenConfig.inboundRateLimit.cfg.rate.toNumber()).to.be.eq(recoveryRate);
    });

    it("rejects when limit is spent", async () => {
      const amountToReceive = bridgeCapacity / 2;
      const bridgePayload = new BridgePayload(mint.toBytes(), remoteSenderBytes, userTA.toBytes(), amountToReceive);
      const message = messageV1(
        inboundMessagePath,
        nonceForeignChain++,
        foreignBridgeAddress,
        bridge.programId.toBuffer(),
        payer.publicKey.toBuffer(),
        bridgePayload.bytes()
      );

      const { payloadHash, payloadHashBytes } = await mailboxUtilities.deliverMessage(
        foreignMailboxAddress,
        foreignLchainId,
        payer,
        message
      );

      const receiverMessageHandledPDA = PublicKey.findProgramAddressSync(
        [Buffer.from("message_handled"), payloadHash],
        bridge.programId
      )[0];

      await expect(
        mailbox.methods
          .handleMessage(payloadHashBytes)
          .accounts({
            handler: payer.publicKey,
            recipientProgram: bridge.programId
          })
          .remainingAccounts([
            {
              pubkey: payer.publicKey,
              isWritable: true,
              isSigner: true
            },
            {
              pubkey: bridgeConfigPDA,
              isWritable: false,
              isSigner: false
            },
            {
              pubkey: receiverMessageHandledPDA,
              isWritable: true,
              isSigner: false
            },
            {
              // token_program
              pubkey: spl.TOKEN_PROGRAM_ID,
              isWritable: false,
              isSigner: false
            },
            {
              // recipient
              pubkey: userTA,
              isWritable: true,
              isSigner: false
            },
            {
              // mint
              pubkey: mint,
              isWritable: true,
              isSigner: false
            },
            {
              // mint_authority
              pubkey: multisig, // or tokenAuth
              isWritable: false,
              isSigner: false
            },
            {
              // token_authority
              pubkey: tokenAuth,
              isWritable: false,
              isSigner: false
            },
            {
              // remote_bridge_config
              pubkey: remoteBridgeConfigPDA,
              isWritable: false,
              isSigner: false
            },
            {
              // local_token_config
              pubkey: localTokenConfigPDA,
              isWritable: false,
              isSigner: false
            },
            {
              // remote_token_config
              pubkey: remoteTokenConfigPDA11,
              isWritable: true,
              isSigner: false
            },
            {
              // inbound_message_path
              pubkey: inboundMessagePathPDA,
              isWritable: false,
              isSigner: false
            },
            {
              pubkey: SystemProgram.programId,
              isWritable: false,
              isSigner: false
            }
          ])
          .signers([payer])
          .rpc({ commitment: "confirmed" })
      ).to.be.rejectedWith("RateLimit: rate limit reached");
    });

    it("receive token_1 from chain_2 while rate limit for chain_1 is spent", async () => {
      const bridgePayload = new BridgePayload(mint.toBytes(), remoteSenderBytes, userTA.toBytes(), bridgeCapacity);
      const message = messageV1(
        inboundMessagePath2,
        nonceForeignChain++,
        foreignBridgeAddress,
        bridge.programId.toBuffer(),
        payer.publicKey.toBuffer(),
        bridgePayload.bytes()
      );

      const { payloadHash, payloadHashBytes } = await mailboxUtilities.deliverMessage(
        foreignMailboxAddress,
        foreignLchainId2,
        payer,
        message
      );

      const tokenBalanceBefore = await spl.getAccount(provider.connection, userTA);

      const receiverMessageHandledPDA = PublicKey.findProgramAddressSync(
        [Buffer.from("message_handled"), payloadHash],
        bridge.programId
      )[0];
      await mailbox.methods
        .handleMessage(payloadHashBytes)
        .accounts({
          handler: payer.publicKey,
          recipientProgram: bridge.programId
        })
        .remainingAccounts([
          {
            pubkey: payer.publicKey,
            isWritable: true,
            isSigner: true
          },
          {
            pubkey: bridgeConfigPDA,
            isWritable: false,
            isSigner: false
          },
          {
            pubkey: receiverMessageHandledPDA,
            isWritable: true,
            isSigner: false
          },
          {
            // token_program
            pubkey: spl.TOKEN_PROGRAM_ID,
            isWritable: false,
            isSigner: false
          },
          {
            // recipient
            pubkey: userTA,
            isWritable: true,
            isSigner: false
          },
          {
            // mint
            pubkey: mint,
            isWritable: true,
            isSigner: false
          },
          {
            // mint_authority
            pubkey: multisig, // or tokenAuth
            isWritable: false,
            isSigner: false
          },
          {
            // token_authority
            pubkey: tokenAuth,
            isWritable: false,
            isSigner: false
          },
          {
            // remote_bridge_config
            pubkey: remoteBridgeConfigPDA2,
            isWritable: false,
            isSigner: false
          },
          {
            // local_token_config
            pubkey: localTokenConfigPDA,
            isWritable: false,
            isSigner: false
          },
          {
            // remote_token_config
            pubkey: remoteTokenConfigPDA21,
            isWritable: true,
            isSigner: false
          },
          {
            // inbound_message_path
            pubkey: inboundMessagePathPDA2,
            isWritable: false,
            isSigner: false
          },
          {
            pubkey: SystemProgram.programId,
            isWritable: false,
            isSigner: false
          }
        ])
        .signers([payer])
        .rpc({ commitment: "confirmed" });

      const tokenBalanceAfter = await spl.getAccount(provider.connection, userTA);
      expect(tokenBalanceAfter.amount).to.be.equal(tokenBalanceBefore.amount + BigInt(bridgeCapacity));
    });

    it("rate limit does not affect deposits", async () => {
      const bridgeRemoteTokenConfigBefore = await bridge.account.remoteTokenConfig.fetch(remoteTokenConfigPDA11);

      let config = await mailbox.account.config.fetch(mailboxConfigPDA);
      let recipient = Buffer.from(sha256("recipient"), "hex");
      let recipientBz = Array.from(Uint8Array.from(recipient));
      let senderBz = Array.from(Uint8Array.from(user.publicKey.toBuffer()));
      const outboundMessagePDA = PublicKey.findProgramAddressSync(
        [Buffer.from("outbound_message"), config.globalNonce.toArrayLike(Buffer, "be", 8)],
        mailbox.programId
      )[0];

      const amountToSend = bridgeCapacity * 10;

      await bridge.methods
        .deposit(senderBz, recipientBz, foreignCallerBytes, new BN(amountToSend), null)
        .accountsPartial({
          sender: sender.publicKey,
          senderTokenAccount: senderTA,
          tokenProgram: spl.TOKEN_PROGRAM_ID,
          config: bridgeConfigPDA,
          senderConfig: senderConfigPDA,
          remoteBridgeConfig: remoteBridgeConfigPDA,
          localTokenConfig: localTokenConfigPDA,
          remoteTokenConfig: remoteTokenConfigPDA11,
          mint: mint,
          mailbox: mailbox.programId,
          mailboxConfig: mailboxConfigPDA,
          outboundMessage: outboundMessagePDA,
          outboundMessagePath: outboundMessagePathPDA,
          mailboxSenderConfig: bridgeSenderConfigPDA,
          treasury: treasury.publicKey
        })
        .signers([sender])
        .rpc({ commitment: "confirmed" });

      const bridgeRemoteTokenConfigAfter = await bridge.account.remoteTokenConfig.fetch(remoteTokenConfigPDA11);
      expect(bridgeRemoteTokenConfigAfter).to.be.deep.eq(bridgeRemoteTokenConfigBefore);
    });

    it("wait for the bridge limit to replenish", async () => {
      await new Promise(r => setTimeout(r, 15000));
    });

    it("rejects when amount of tokens exceeds capacity", async () => {
      const amountToReceive = bridgeCapacity + 1;
      const bridgePayload = new BridgePayload(mint.toBytes(), remoteSenderBytes, userTA.toBytes(), amountToReceive);
      const message = messageV1(
        inboundMessagePath,
        nonceForeignChain++,
        foreignBridgeAddress,
        bridge.programId.toBuffer(),
        payer.publicKey.toBuffer(),
        bridgePayload.bytes()
      );

      const { payloadHash, payloadHashBytes } = await mailboxUtilities.deliverMessage(
        foreignMailboxAddress,
        foreignLchainId,
        payer,
        message
      );

      const receiverMessageHandledPDA = PublicKey.findProgramAddressSync(
        [Buffer.from("message_handled"), payloadHash],
        bridge.programId
      )[0];

      await expect(
        mailbox.methods
          .handleMessage(payloadHashBytes)
          .accounts({
            handler: payer.publicKey,
            recipientProgram: bridge.programId
          })
          .remainingAccounts([
            {
              pubkey: payer.publicKey,
              isWritable: true,
              isSigner: true
            },
            {
              pubkey: bridgeConfigPDA,
              isWritable: false,
              isSigner: false
            },
            {
              pubkey: receiverMessageHandledPDA,
              isWritable: true,
              isSigner: false
            },
            {
              // token_program
              pubkey: spl.TOKEN_PROGRAM_ID,
              isWritable: false,
              isSigner: false
            },
            {
              // recipient
              pubkey: userTA,
              isWritable: true,
              isSigner: false
            },
            {
              // mint
              pubkey: mint,
              isWritable: true,
              isSigner: false
            },
            {
              // mint_authority
              pubkey: multisig, // or tokenAuth
              isWritable: false,
              isSigner: false
            },
            {
              // token_authority
              pubkey: tokenAuth,
              isWritable: false,
              isSigner: false
            },
            {
              // remote_bridge_config
              pubkey: remoteBridgeConfigPDA,
              isWritable: false,
              isSigner: false
            },
            {
              // local_token_config
              pubkey: localTokenConfigPDA,
              isWritable: false,
              isSigner: false
            },
            {
              // remote_token_config
              pubkey: remoteTokenConfigPDA11,
              isWritable: true,
              isSigner: false
            },
            {
              // inbound_message_path
              pubkey: inboundMessagePathPDA,
              isWritable: false,
              isSigner: false
            },
            {
              pubkey: SystemProgram.programId,
              isWritable: false,
              isSigner: false
            }
          ])
          .signers([payer])
          .rpc({ commitment: "confirmed" })
      ).to.be.rejectedWith("RateLimit: max capacity exceeded");
    });

    it("receive tokens after rate limit replenished", async () => {
      const amountToReceive = 1000;
      const bridgePayload = new BridgePayload(mint.toBytes(), remoteSenderBytes, userTA.toBytes(), amountToReceive);
      const message = messageV1(
        inboundMessagePath,
        nonceForeignChain++,
        foreignBridgeAddress,
        bridge.programId.toBuffer(),
        payer.publicKey.toBuffer(),
        bridgePayload.bytes()
      );

      const { payloadHash, payloadHashBytes } = await mailboxUtilities.deliverMessage(
        foreignMailboxAddress,
        foreignLchainId,
        payer,
        message
      );

      const receiverMessageHandledPDA = PublicKey.findProgramAddressSync(
        [Buffer.from("message_handled"), payloadHash],
        bridge.programId
      )[0];

      const tokenBalanceBefore = await spl.getAccount(provider.connection, userTA);

      await mailbox.methods
        .handleMessage(payloadHashBytes)
        .accounts({
          handler: payer.publicKey,
          recipientProgram: bridge.programId
        })
        .remainingAccounts([
          {
            pubkey: payer.publicKey,
            isWritable: true,
            isSigner: true
          },
          {
            pubkey: bridgeConfigPDA,
            isWritable: false,
            isSigner: false
          },
          {
            pubkey: receiverMessageHandledPDA,
            isWritable: true,
            isSigner: false
          },
          {
            // token_program
            pubkey: spl.TOKEN_PROGRAM_ID,
            isWritable: false,
            isSigner: false
          },
          {
            // recipient
            pubkey: userTA,
            isWritable: true,
            isSigner: false
          },
          {
            // mint
            pubkey: mint,
            isWritable: true,
            isSigner: false
          },
          {
            // mint_authority
            pubkey: multisig, // or tokenAuth
            isWritable: false,
            isSigner: false
          },
          {
            // token_authority
            pubkey: tokenAuth,
            isWritable: false,
            isSigner: false
          },
          {
            // remote_bridge_config
            pubkey: remoteBridgeConfigPDA,
            isWritable: false,
            isSigner: false
          },
          {
            // local_token_config
            pubkey: localTokenConfigPDA,
            isWritable: false,
            isSigner: false
          },
          {
            // remote_token_config
            pubkey: remoteTokenConfigPDA11,
            isWritable: true,
            isSigner: false
          },
          {
            // inbound_message_path
            pubkey: inboundMessagePathPDA,
            isWritable: false,
            isSigner: false
          },
          {
            pubkey: SystemProgram.programId,
            isWritable: false,
            isSigner: false
          }
        ])
        .signers([payer])
        .rpc({ commitment: "confirmed" });
      const timeNow = Math.round(Date.now() / 1000);

      const tokenBalanceAfter = await spl.getAccount(provider.connection, userTA);
      expect(tokenBalanceAfter.amount).to.be.equal(tokenBalanceBefore.amount + BigInt(amountToReceive));

      let bridgeRemoteTokenConfig = await bridge.account.remoteTokenConfig.fetch(remoteTokenConfigPDA11);

      expect(bridgeRemoteTokenConfig.chainId).to.be.deep.eq(foreignLchainIdBytes);
      expect(bridgeRemoteTokenConfig.inboundRateLimit.tokens.toNumber()).to.eq(bridgeCapacity - amountToReceive);
      expect(bridgeRemoteTokenConfig.inboundRateLimit.lastUpdated.toNumber()).to.closeTo(timeNow, 2);
      expect(bridgeRemoteTokenConfig.inboundRateLimit.cfg.enabled).to.be.true;
      expect(bridgeRemoteTokenConfig.inboundRateLimit.cfg.capacity.toNumber()).to.be.eq(bridgeCapacity);
      expect(bridgeRemoteTokenConfig.inboundRateLimit.cfg.rate.toNumber()).to.be.eq(recoveryRate);
    });

    it("disable ratelimit for token_1", async () => {
      await bridge.methods
        .setRateLimit(mint, foreignLchainIdBytes, {
          rate: new BN(0),
          capacity: new BN(0),
          enabled: false
        })
        .accountsPartial({
          admin: admin.publicKey,
          config: bridgeConfigPDA,
          remoteTokenConfig: remoteTokenConfigPDA11
        })
        .signers([admin])
        .rpc({ commitment: "confirmed" });

      const timeNow = Math.round(Date.now() / 1000);

      let bridgeRemoteTokenConfig = await bridge.account.remoteTokenConfig.fetch(remoteTokenConfigPDA11);

      expect(bridgeRemoteTokenConfig.inboundRateLimit.lastUpdated.toNumber()).to.closeTo(timeNow, 2);
      expect(bridgeRemoteTokenConfig.inboundRateLimit.cfg.enabled).to.be.false;
      expect(bridgeRemoteTokenConfig.inboundRateLimit.cfg.capacity.toNumber()).to.be.eq(0);
      expect(bridgeRemoteTokenConfig.inboundRateLimit.cfg.rate.toNumber()).to.be.eq(0);
    });

    it("receive token_1 after rate limit disabled", async () => {
      const amountToReceive = bridgeCapacity + 1;
      const bridgePayload = new BridgePayload(mint.toBytes(), remoteSenderBytes, userTA.toBytes(), amountToReceive);
      const message = messageV1(
        inboundMessagePath,
        nonceForeignChain++,
        foreignBridgeAddress,
        bridge.programId.toBuffer(),
        payer.publicKey.toBuffer(),
        bridgePayload.bytes()
      );

      const { payloadHash, payloadHashBytes } = await mailboxUtilities.deliverMessage(
        foreignMailboxAddress,
        foreignLchainId,
        payer,
        message
      );

      const tokenBalanceBefore = await spl.getAccount(provider.connection, userTA);

      const receiverMessageHandledPDA = PublicKey.findProgramAddressSync(
        [Buffer.from("message_handled"), payloadHash],
        bridge.programId
      )[0];
      await mailbox.methods
        .handleMessage(payloadHashBytes)
        .accounts({
          handler: payer.publicKey,
          recipientProgram: bridge.programId
        })
        .remainingAccounts([
          {
            pubkey: payer.publicKey,
            isWritable: true,
            isSigner: true
          },
          {
            pubkey: bridgeConfigPDA,
            isWritable: false,
            isSigner: false
          },
          {
            pubkey: receiverMessageHandledPDA,
            isWritable: true,
            isSigner: false
          },
          {
            // token_program
            pubkey: spl.TOKEN_PROGRAM_ID,
            isWritable: false,
            isSigner: false
          },
          {
            // recipient
            pubkey: userTA,
            isWritable: true,
            isSigner: false
          },
          {
            // mint
            pubkey: mint,
            isWritable: true,
            isSigner: false
          },
          {
            // mint_authority
            pubkey: multisig, // or tokenAuth
            isWritable: false,
            isSigner: false
          },
          {
            // token_authority
            pubkey: tokenAuth,
            isWritable: false,
            isSigner: false
          },
          {
            // remote_bridge_config
            pubkey: remoteBridgeConfigPDA,
            isWritable: false,
            isSigner: false
          },
          {
            // local_token_config
            pubkey: localTokenConfigPDA,
            isWritable: false,
            isSigner: false
          },
          {
            // remote_token_config
            pubkey: remoteTokenConfigPDA11,
            isWritable: true,
            isSigner: false
          },
          {
            // inbound_message_path
            pubkey: inboundMessagePathPDA,
            isWritable: false,
            isSigner: false
          },
          {
            pubkey: SystemProgram.programId,
            isWritable: false,
            isSigner: false
          }
        ])
        .signers([payer])
        .rpc({ commitment: "confirmed" });

      const tokenBalanceAfter = await spl.getAccount(provider.connection, userTA);
      expect(tokenBalanceAfter.amount).to.be.equal(tokenBalanceBefore.amount + BigInt(amountToReceive));
    });
  });
});
