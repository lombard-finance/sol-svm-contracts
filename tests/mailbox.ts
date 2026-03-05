import "dotenv/config";
import * as anchor from "@coral-xyz/anchor";
import { BN, BorshCoder, EventManager, Program } from "@coral-xyz/anchor";
import { Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import { Consortium } from "../target/types/consortium";
import { Mailbox } from "../target/types/mailbox";
import { sha256 } from "js-sha256";
import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import { ConsortiumUtility, randomNumber } from "./consortium_utilities";
import { keccak256 } from "ethers";
import { MailboxReceiver } from "../target/types/mailbox_receiver";
import { MESSAGE_V1_SELECTOR, MessageV1 } from "./mailbox_utilities";
import {
  BITCOIN_LCHAIN_ID,
  fundWallet,
  LCHAIN_ID,
  LEDGER_LCHAIN_ID,
  LEDGER_LCHAIN_ID_BZ,
  LEDGER_MAILBOX_ADDRESS,
  LEDGER_MAILBOX_ADDRESS_BZ,
  ZERO_BUFFER32
} from "./asset_router_utilities";
import { describe } from "mocha";
import { AssetRouter } from "../target/types/asset_router";

chai.use(chaiAsPromised);
const expect = chai.expect;

declare module "@coral-xyz/anchor" {
  interface BN {
    toBigInt(): bigint;
  }
}

BN.prototype.toBigInt = function (): bigint {
  return BigInt(this.toString(10));
};

describe("Mailbox", () => {
  let globalNonce = 0;

  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const consortium = anchor.workspace.Consortium as Program<Consortium>;
  const consortiumUtility = new ConsortiumUtility(consortium);

  const mailbox = anchor.workspace.Mailbox as Program<Mailbox>;
  let configPDA: PublicKey;
  const programEventManager = new EventManager(mailbox.programId, provider, new BorshCoder(mailbox.idl));

  const assetRouter = anchor.workspace.AssetRouter as Program<AssetRouter>;

  const mailboxReceiver = anchor.workspace.MailboxReceiver as Program<MailboxReceiver>;

  // ---Signers
  const payer = Keypair.generate();
  const payerFeeExempt = Keypair.generate();
  const treasury = Keypair.generate();
  const user = Keypair.generate();
  const admin = Keypair.generate();
  const pauser = Keypair.generate();
  const t = Keypair.generate();

  const accountRolesPauserPDA = PublicKey.findProgramAddressSync(
    [Buffer.from("account_roles"), pauser.publicKey.toBuffer()],
    mailbox.programId
  )[0];
  // ---Paths values
  const inboundMessagePath = Buffer.from(
    keccak256(Buffer.concat([LEDGER_MAILBOX_ADDRESS, LEDGER_LCHAIN_ID, LCHAIN_ID])).slice(2),
    "hex"
  );
  const inboundMessagePathBytes = Array.from(Uint8Array.from(inboundMessagePath));
  const inboundMessagePathPDA = PublicKey.findProgramAddressSync(
    [Buffer.from("inbound_message_path"), LEDGER_LCHAIN_ID],
    mailbox.programId
  )[0];

  const outboundMessagePath = Buffer.from(
    keccak256(Buffer.concat([mailbox.programId.toBuffer(), LCHAIN_ID, LEDGER_LCHAIN_ID])).slice(2),
    "hex"
  );
  const outboundMessagePathPDA = PublicKey.findProgramAddressSync(
    [Buffer.from("outbound_message_path"), LEDGER_LCHAIN_ID],
    mailbox.programId
  )[0];
  const outboundMessagePathBytes = Array.from(Uint8Array.from(outboundMessagePath));
  const systemProgramSenderConfigPDA = PublicKey.findProgramAddressSync(
    [Buffer.from("sender_config"), SystemProgram.programId.toBuffer()],
    mailbox.programId
  )[0];

  // ---Fee properties
  const defaultMaxPayloadSize = 512;
  // tests rely on the fact that minimum fee for a legitimate gmp message e.g. 260 * feePerByte
  // is greater than the fee payed for gas and rent of the instruction under test
  // this is just for ease of assertions to avoid to exactly calculate the instruction fee
  const feePerByte = new BN(1000000);

  before("fund wallets and initialize consortium utility", async () => {
    await fundWallet(payer, 25);
    await fundWallet(payerFeeExempt, 25);
    await fundWallet(user, 25);
    await fundWallet(admin, 25);
    await fundWallet(t, 25);

    [configPDA] = PublicKey.findProgramAddressSync([Buffer.from("mailbox_config")], mailbox.programId);

    consortiumUtility.generateAndAddKeypairs(3);
    await consortiumUtility.initializeConsortiumProgram(admin);
  });

  describe("Initialize and set roles", function () {
    it("initialize: fails when payer is not deployer", async () => {
      await expect(
        mailbox.methods
          .initialize(payer.publicKey, consortium.programId, treasury.publicKey, defaultMaxPayloadSize, feePerByte)
          .accounts({
            deployer: payer.publicKey
          })
          .signers([payer])
          .rpc({ commitment: "confirmed" })
      ).to.be.rejectedWith("Unauthorized function call");
    });

    it("initialize: successful", async () => {
      await mailbox.methods
        .initialize(
          provider.wallet.publicKey,
          consortium.programId,
          treasury.publicKey,
          defaultMaxPayloadSize,
          feePerByte
        )
        .accounts({
          deployer: provider.wallet.publicKey
        })
        .signers([Keypair.fromSecretKey(provider.wallet.payer.secretKey)])
        .rpc({ commitment: "confirmed" });

      const cfg = await mailbox.account.config.fetch(configPDA);
      expect(cfg.admin.toBase58()).to.be.eq(provider.wallet.publicKey.toBase58());
      expect(cfg.consortium.toBase58()).to.be.eq(consortium.programId.toBase58());
      expect(cfg.treasury.toBase58()).to.be.eq(treasury.publicKey.toBase58());
      expect(cfg.defaultMaxPayloadSize).to.be.eq(defaultMaxPayloadSize);
      expect(cfg.feePerByte.toBigInt()).to.be.eq(feePerByte.toBigInt());
    });
  });

  describe("Ownership", function () {
    it("transferOwnership: failure from unauthorized party", async () => {
      await expect(
        mailbox.methods
          .transferOwnership(admin.publicKey)
          .accounts({
            admin: admin.publicKey
          })
          .signers([admin])
          .rpc()
      ).to.be.rejectedWith("Unauthorized");
    });

    it("transferOwnership: successful by admin", async () => {
      await mailbox.methods
        .transferOwnership(admin.publicKey)
        .accounts({
          admin: provider.wallet.publicKey
        })
        .signers([Keypair.fromSecretKey(provider.wallet.payer.secretKey)])
        .rpc({ commitment: "confirmed" });

      const cfg = await mailbox.account.config.fetch(configPDA);
      expect(cfg.admin.toBase58()).to.be.equal(provider.wallet.publicKey.toBase58());
      expect(cfg.pendingAdmin.toBase58()).to.be.equal(admin.publicKey.toBase58());
    });

    it("acceptOwnership: failure from unauthorized party", async () => {
      await expect(
        mailbox.methods
          .acceptOwnership()
          .accounts({ payer: provider.wallet.publicKey })
          .signers([Keypair.fromSecretKey(provider.wallet.payer.secretKey)])
          .rpc()
      ).to.be.rejectedWith("Unauthorized");
    });

    it("acceptOwnership: successful by pending admin", async () => {
      await mailbox.methods
        .acceptOwnership()
        .accounts({ payer: admin.publicKey })
        .signers([admin])
        .rpc({ commitment: "confirmed" });

      const cfg = await mailbox.account.config.fetch(configPDA);
      expect(cfg.admin.toBase58()).to.be.equal(admin.publicKey.toBase58());
      expect(cfg.pendingAdmin.toBase58()).to.be.equal(SystemProgram.programId.toBase58());
    });
  });

  describe("Grant and revoke roles", () => {
    it("Grant role", async () => {
      await mailbox.methods
        .grantAccountRole(pauser.publicKey, { pauser: {} })
        .accounts({
          admin: admin.publicKey
        })
        .signers([admin])
        .rpc({ commitment: "confirmed" });
      const accountRoles = await mailbox.account.accountRoles.fetch(accountRolesPauserPDA);
      expect(accountRoles.roles).to.be.deep.eq([{ pauser: {} }]);
    });
    it("Revoke role", async () => {
      await mailbox.methods
        .revokeAccountRoles(pauser.publicKey)
        .accounts({
          admin: admin.publicKey
        })
        .signers([admin])
        .rpc({ commitment: "confirmed" });
      // Check that the account roles PDA was closed (account no longer exists)
      await expect(mailbox.account.accountRoles.fetch(accountRolesPauserPDA)).to.be.rejectedWith(
        /Account does not exist|AccountNotFound/
      );
    });
  });

  describe("Messaging path", () => {
    const InboundMsgPathEvents = [];
    const OutboundMsgPathEvents = [];
    const listeners: number[] = [];

    before(async function () {
      listeners.push(
        programEventManager.addEventListener("inboundMessagePathStatusChanged", e => {
          console.log(JSON.stringify(e));
          InboundMsgPathEvents.push(e);
        })
      );
      listeners.push(
        programEventManager.addEventListener("outboundMessagePathStatusChanged", e => {
          console.log(JSON.stringify(e));
          OutboundMsgPathEvents.push(e);
        })
      );
    });

    afterEach(async function () {
      InboundMsgPathEvents.length = 0;
      OutboundMsgPathEvents.length = 0;
    });

    after(async function () {
      for (const l of listeners) {
        await programEventManager.removeEventListener(l);
      }
    });

    it("enableInboundMessagePath rejects when called by not admin", async () => {
      await expect(
        mailbox.methods
          .enableInboundMessagePath(LEDGER_LCHAIN_ID_BZ, LEDGER_MAILBOX_ADDRESS_BZ)
          .accounts({
            admin: payer.publicKey,
          })
          .signers([payer])
          .rpc()
      ).to.be.rejectedWith("Unauthorized");
    });

    it("enableInboundMessagePath successful by admin", async () => {
      await mailbox.methods
        .enableInboundMessagePath(LEDGER_LCHAIN_ID_BZ, LEDGER_MAILBOX_ADDRESS_BZ)
        .accounts({
          admin: admin.publicKey,
        })
        .signers([admin])
        .rpc({ commitment: "confirmed" });

      const inboundMessagePathAccount = await mailbox.account.inboundMessagePath.fetch(inboundMessagePathPDA);
      expect(inboundMessagePathAccount.identifier).to.be.deep.eq(inboundMessagePathBytes);
      expect(inboundMessagePathAccount.sourceMailboxAddress).to.be.deep.eq(LEDGER_MAILBOX_ADDRESS_BZ);
      expect(inboundMessagePathAccount.sourceChainId).to.be.deep.eq(LEDGER_LCHAIN_ID_BZ);

      //Event
      expect(InboundMsgPathEvents[0]).to.be.not.undefined;
      expect(InboundMsgPathEvents[0].identifier).to.be.deep.eq(inboundMessagePathBytes);
      expect(InboundMsgPathEvents[0].sourceMailboxAddress).to.be.deep.eq(LEDGER_MAILBOX_ADDRESS_BZ);
      expect(InboundMsgPathEvents[0].sourceChainId).to.be.deep.eq(LEDGER_LCHAIN_ID_BZ);
      expect(InboundMsgPathEvents[0].enabled).to.be.true;
    });

    it("enableInboundMessagePath 2nd mailbox on the dChain", async () => {
      const anotherMailbox = Buffer.from("00000000000000000000000000000000000000000000000000000000000000aa", "hex");
      const anotherMailboxBytes = Array.from(Uint8Array.from(anotherMailbox));
      const inboundMessagePath = Buffer.from(
        keccak256(Buffer.concat([anotherMailbox, LEDGER_LCHAIN_ID, LCHAIN_ID])).slice(2),
        "hex"
      );

      await expect(
        mailbox.methods
          .enableInboundMessagePath(LEDGER_LCHAIN_ID_BZ, anotherMailboxBytes)
          .accounts({
            admin: admin.publicKey,
          })
          .signers([admin])
          .rpc({ commitment: "confirmed" })
      ).to.be.rejectedWith("already in use");
    });

    it("enableOutboundMessagePath rejects when called by not admin", async () => {
      await expect(
        mailbox.methods
          .enableOutboundMessagePath(LEDGER_LCHAIN_ID_BZ)
          .accounts({
            admin: payer.publicKey,
          })
          .signers([payer])
          .rpc()
      ).to.be.rejectedWith("Unauthorized");
    });

    it("enableOutboundMessagePath successful by admin", async () => {
      await mailbox.methods
        .enableOutboundMessagePath(LEDGER_LCHAIN_ID_BZ)
        .accounts({
          admin: admin.publicKey,
        })
        .signers([admin])
        .rpc({ commitment: "confirmed" });

      const outboundMessagePathAccount = await mailbox.account.outboundMessagePath.fetch(outboundMessagePathPDA);
      expect(outboundMessagePathAccount.identifier).to.be.deep.eq(outboundMessagePathBytes);
      expect(outboundMessagePathAccount.destinationChainId).to.be.deep.eq(LEDGER_LCHAIN_ID_BZ);

      //Event
      expect(OutboundMsgPathEvents[0]).to.be.not.undefined;
      expect(OutboundMsgPathEvents[0].identifier).to.be.deep.eq(outboundMessagePathBytes);
      expect(OutboundMsgPathEvents[0].destinationChainId).to.be.deep.eq(LEDGER_LCHAIN_ID_BZ);
      expect(OutboundMsgPathEvents[0].enabled).to.be.true;
    });

    it("enableOutboundMessagePath to one more chain", async () => {
      const anotherChainId = Buffer.from(sha256("another-chain-id"), "hex");
      const anotherChainIdBytes = Array.from(Uint8Array.from(anotherChainId));

      const outboundMessagePath = Buffer.from(
        keccak256(Buffer.concat([mailbox.programId.toBuffer(), LCHAIN_ID, anotherChainId])).slice(2),
        "hex"
      );
      const anotherOutboundMessagePathPDA = PublicKey.findProgramAddressSync(
        [Buffer.from("outbound_message_path"), anotherChainId],
        mailbox.programId
      )[0];
      const anotherOutboundMessagePathBytes = Array.from(Uint8Array.from(outboundMessagePath));

      await mailbox.methods
        .enableOutboundMessagePath(anotherChainIdBytes)
        .accounts({
          admin: admin.publicKey,
        })
        .signers([admin])
        .rpc({ commitment: "confirmed" });

      //New one is set
      const anotherOutboundMessagePathAccount = await mailbox.account.outboundMessagePath.fetch(
        anotherOutboundMessagePathPDA
      );
      expect(anotherOutboundMessagePathAccount.identifier).to.be.deep.eq(anotherOutboundMessagePathBytes);
      expect(anotherOutboundMessagePathAccount.destinationChainId).to.be.deep.eq(anotherChainIdBytes);

      //Previous one is ok
      const outboundMessagePathAccount = await mailbox.account.outboundMessagePath.fetch(outboundMessagePathPDA);
      expect(outboundMessagePathAccount.identifier).to.be.deep.eq(outboundMessagePathBytes);
      expect(outboundMessagePathAccount.destinationChainId).to.be.deep.eq(LEDGER_LCHAIN_ID_BZ);

      //Event
      expect(OutboundMsgPathEvents[0]).to.be.not.undefined;
      expect(OutboundMsgPathEvents[0].identifier).to.be.deep.eq(anotherOutboundMessagePathBytes);
      expect(OutboundMsgPathEvents[0].destinationChainId).to.be.deep.eq(anotherChainIdBytes);
      expect(OutboundMsgPathEvents[0].enabled).to.be.true;
    });

    it("disableInboundMessagePath rejects when called by not admin", async () => {
      await expect(
        mailbox.methods
          .disableInboundMessagePath(LEDGER_LCHAIN_ID_BZ)
          .accounts({
            admin: payer.publicKey,
          })
          .signers([payer])
          .rpc()
      ).to.be.rejectedWith("Unauthorized");
    });

    it("disableInboundMessagePath successful by admin", async () => {
      await mailbox.methods
        .disableInboundMessagePath(LEDGER_LCHAIN_ID_BZ)
        .accounts({
          admin: admin.publicKey,
        })
        .signers([admin])
        .rpc({ commitment: "confirmed" });

      expect(await provider.connection.getAccountInfo(inboundMessagePathPDA)).to.be.null;

      //Event
      expect(InboundMsgPathEvents[0]).to.be.not.undefined;
      expect(InboundMsgPathEvents[0].identifier).to.be.deep.eq(inboundMessagePathBytes);
      expect(InboundMsgPathEvents[0].sourceMailboxAddress).to.be.deep.eq(LEDGER_MAILBOX_ADDRESS_BZ);
      expect(InboundMsgPathEvents[0].sourceChainId).to.be.deep.eq(LEDGER_LCHAIN_ID_BZ);
      expect(InboundMsgPathEvents[0].enabled).to.be.false;
    });

    it("disableOutboundMessagePath rejects when called by not admin", async () => {
      await expect(
        mailbox.methods
          .disableOutboundMessagePath(LEDGER_LCHAIN_ID_BZ)
          .accounts({
            admin: payer.publicKey,
          })
          .signers([payer])
          .rpc()
      ).to.be.rejectedWith("Unauthorized");
    });

    it("disableOutboundMessagePath successful by admin", async () => {
      await mailbox.methods
        .disableOutboundMessagePath(LEDGER_LCHAIN_ID_BZ)
        .accounts({
          admin: admin.publicKey,
        })
        .signers([admin])
        .rpc({ commitment: "confirmed" });

      expect(await provider.connection.getAccountInfo(outboundMessagePathPDA)).to.be.null;

      //Event
      expect(OutboundMsgPathEvents[0]).to.be.not.undefined;
      expect(OutboundMsgPathEvents[0].identifier).to.be.deep.eq(outboundMessagePathBytes);
      expect(OutboundMsgPathEvents[0].destinationChainId).to.be.deep.eq(LEDGER_LCHAIN_ID_BZ);
      expect(OutboundMsgPathEvents[0].enabled).to.be.false;
    });
  });

  describe("Deliver and handle message success flow", () => {
    const MsgDeliveredEvents = [];
    const MsgHandledEvents = [];
    const listeners: number[] = [];
    const msgSender = Keypair.generate();

    before("Enable inbound message path before the test", async () => {
      listeners.push(
        programEventManager.addEventListener("messageDelivered", e => {
          console.log(JSON.stringify(e));
          MsgDeliveredEvents.push(e);
        })
      );
      listeners.push(
        programEventManager.addEventListener("messageHandled", e => {
          console.log(JSON.stringify(e));
          MsgHandledEvents.push(e);
        })
      );

      await mailbox.methods
        .enableInboundMessagePath(LEDGER_LCHAIN_ID_BZ, LEDGER_MAILBOX_ADDRESS_BZ)
        .accounts({
          admin: admin.publicKey,
        })
        .signers([admin])
        .rpc({ commitment: "confirmed" });

      await mailboxReceiver.methods
        .initialize(mailbox.programId)
        .accounts({
          deployer: provider.wallet.publicKey
        })
        .signers([Keypair.fromSecretKey(provider.wallet.payer.secretKey)])
        .rpc({ commitment: "confirmed" });
    });

    afterEach(async function () {
      MsgDeliveredEvents.length = 0;
      MsgHandledEvents.length = 0;
    });

    after(async function () {
      for (const l of listeners) {
        await programEventManager.removeEventListener(l);
      }
    });

    const dCallers = [
      {
        name: "specified",
        dCallerAddress: user.publicKey.toBuffer(),
        expectedDCallerAddress: Array.from(user.publicKey.toBuffer())
      },
      {
        name: "any address",
        dCallerAddress: ZERO_BUFFER32,
        expectedDCallerAddress: null
      }
    ];

    dCallers.forEach(function (dCaller) {
      const message = new MessageV1(
        inboundMessagePath,
        globalNonce++,
        msgSender.publicKey.toBuffer(),
        mailboxReceiver.programId.toBuffer(),
        Buffer.from("test"),
        dCaller.dCallerAddress
      );
      const payloadHash = message.toHash();
      const payloadHashBytes = message.toHashBytes();

      const sessionPayloadPDA = PublicKey.findProgramAddressSync(
        [Buffer.from("session_payload"), payer.publicKey.toBuffer(), payloadHash],
        consortium.programId
      )[0];
      const messageInfoPDA = PublicKey.findProgramAddressSync(
        [Buffer.from("message"), payloadHash],
        mailbox.programId
      )[0];
      const receiverConfigPDA = PublicKey.findProgramAddressSync(
        [Buffer.from("mailbox_receiver_config")],
        mailboxReceiver.programId
      )[0];
      // a PDA the test receiver program uses to track if the message has been handled
      const receiverMessageHandledPDA = PublicKey.findProgramAddressSync(
        [Buffer.from("message_handled"), payloadHash],
        mailboxReceiver.programId
      )[0];

      it(`deliverMessage when dCaller is ${dCaller.name}`, async () => {
        const { validatedPayloadPDA } = await consortiumUtility.createAndFinalizeSession(payer, message.toBuffer());

        await consortium.methods
          .postSessionPayload(payloadHashBytes, message.toBuffer(), message.toBuffer().length)
          .accounts({
            payer: payer.publicKey,
            sessionPayload: sessionPayloadPDA
          })
          .signers([payer])
          .rpc({ commitment: "confirmed" });

        await mailbox.methods
          .deliverMessage(payloadHashBytes)
          .accounts({
            deliverer: payer.publicKey,
            inboundMessagePath: inboundMessagePathPDA,
            consortiumPayload: sessionPayloadPDA,
            consortiumValidatedPayload: validatedPayloadPDA
          })
          .signers([payer])
          .rpc({ commitment: "confirmed" });

        const messageInfo = await mailbox.account.messageV1Info.fetch(messageInfoPDA);
        expect(messageInfo.message.messagePathIdentifier).to.be.deep.eq(inboundMessagePathBytes);
        expect(messageInfo.message.nonce.toNumber()).to.be.eq(message.nonce);
        expect(messageInfo.message.sender).to.be.deep.eq(Array.from(message.sender));
        expect(messageInfo.message.recipient).to.be.deep.eq(Array.from(message.recipient));
        expect(messageInfo.message.destinationCaller).to.be.deep.eq(dCaller.expectedDCallerAddress);
        expect(messageInfo.message.body).to.be.deep.eq(message.body);
        expect(messageInfo.status).to.deep.eq({ delivered: {} });

        //Event
        expect(MsgDeliveredEvents[0]).to.be.not.undefined;
        expect(MsgDeliveredEvents[0].payloadHash).to.be.deep.eq(payloadHashBytes);
        expect(MsgDeliveredEvents[0].sourceMailboxAddress).to.be.deep.eq(LEDGER_MAILBOX_ADDRESS_BZ);
        expect(MsgDeliveredEvents[0].sourceChainId).to.be.deep.eq(LEDGER_LCHAIN_ID_BZ);
      });

      it(`handleMessage when dCaller is ${dCaller.name}`, async () => {
        await mailbox.methods
          .handleMessage(payloadHashBytes)
          .accounts({
            handler: user.publicKey,
            recipientProgram: mailboxReceiver.programId
          })
          .remainingAccounts([
            {
              pubkey: user.publicKey,
              isWritable: true,
              isSigner: true
            },
            {
              pubkey: receiverConfigPDA,
              isWritable: false,
              isSigner: false
            },
            {
              pubkey: receiverMessageHandledPDA,
              isWritable: true,
              isSigner: false
            },
            {
              pubkey: SystemProgram.programId,
              isWritable: false,
              isSigner: false
            }
          ])
          .signers([user])
          .rpc({ commitment: "confirmed" });

        const messageInfo = await mailbox.account.messageV1Info.fetch(messageInfoPDA);
        expect(messageInfo.message.messagePathIdentifier).to.be.deep.eq(inboundMessagePathBytes);
        expect(messageInfo.message.nonce.toNumber()).to.be.eq(message.nonce);
        expect(messageInfo.message.sender).to.be.deep.eq(Array.from(message.sender));
        expect(messageInfo.message.recipient).to.be.deep.eq(Array.from(message.recipient));
        expect(messageInfo.message.destinationCaller).to.be.deep.eq(dCaller.expectedDCallerAddress);
        expect(messageInfo.message.body).to.be.deep.eq(message.body);
        expect(messageInfo.status).to.deep.eq({ handled: {} });

        expect(await mailboxReceiver.account.messageHandled.fetch(receiverMessageHandledPDA)).to.be.deep.eq({});

        //Event
        expect(MsgHandledEvents[0]).to.be.not.undefined;
        expect(MsgHandledEvents[0].payloadHash).to.be.deep.eq(payloadHashBytes);
      });

      it("handleMessage rejects when already handled", async () => {
        await expect(
          mailbox.methods
            .handleMessage(payloadHashBytes)
            .accounts({
              handler: user.publicKey,
              recipientProgram: mailboxReceiver.programId
            })
            .remainingAccounts([
              {
                pubkey: user.publicKey,
                isWritable: true,
                isSigner: true
              },
              {
                pubkey: receiverConfigPDA,
                isWritable: false,
                isSigner: false
              },
              {
                pubkey: receiverMessageHandledPDA,
                isWritable: true,
                isSigner: false
              },
              {
                pubkey: SystemProgram.programId,
                isWritable: false,
                isSigner: false
              }
            ])
            .signers([user])
            .rpc({ commitment: "confirmed" })
        ).to.be.rejectedWith("InvalidPayloadState");
      });
    });
  });

  describe("Deliver message negative cases", () => {
    const message = new MessageV1(
      inboundMessagePath,
      ++globalNonce,
      user.publicKey.toBuffer(),
      mailboxReceiver.programId.toBuffer(),
      Buffer.from("test")
    );
    const sessionPayloadPDA = message.sessionPayloadPDA(payer);
    let validatedPayloadPDA: PublicKey;

    before(async function () {
      const result = await consortiumUtility.createAndFinalizeSession(payer, message.toBuffer());
      validatedPayloadPDA = result.validatedPayloadPDA;

      await consortium.methods
        .postSessionPayload(message.toHashBytes(), message.toBuffer(), message.toBuffer().length)
        .accounts({
          payer: payer.publicKey,
          sessionPayload: sessionPayloadPDA
        })
        .signers([payer])
        .rpc({ commitment: "confirmed" });
    });

    it("postSessionPayload when payload is not validated", async function () {
      const message = new MessageV1(
        inboundMessagePath,
        ++globalNonce,
        user.publicKey.toBuffer(),
        mailboxReceiver.programId.toBuffer(),
        Buffer.from("test")
      );

      await consortium.methods
        .postSessionPayload(message.toHashBytes(), message.toBuffer(), message.toBuffer().length)
        .accounts({
          payer: payer.publicKey,
          sessionPayload: message.sessionPayloadPDA(payer)
        })
        .signers([payer])
        .rpc({ commitment: "confirmed" });

      const validatedPayloadPDA = PublicKey.findProgramAddressSync(
        [Buffer.from("validated_payload"), message.toHash()],
        consortium.programId
      )[0];

      await expect(
        mailbox.methods
          .deliverMessage(message.toHashBytes())
          .accounts({
            deliverer: payer.publicKey,
            inboundMessagePath: inboundMessagePathPDA,
            consortiumPayload: message.sessionPayloadPDA(payer),
            consortiumValidatedPayload: validatedPayloadPDA
          })
          .signers([payer])
          .rpc({ commitment: "confirmed" })
      ).to.be.rejectedWith("consortium_validated_payload. Error Code: AccountNotInitialized");
    });

    it("Session payload not finished", async function () {
      const message = new MessageV1(
        inboundMessagePath,
        ++globalNonce,
        user.publicKey.toBuffer(),
        mailboxReceiver.programId.toBuffer(),
        Buffer.from("test")
      );

      const { validatedPayloadPDA } = await consortiumUtility.createAndFinalizeSession(payer, message.toBuffer());
      const sessionPayloadPDA = message.sessionPayloadPDA(payer);

      const chunk = message.toBuffer().subarray(0, message.toBuffer().length / 2);
      await consortium.methods
        .postSessionPayload(message.toHashBytes(), chunk, message.toBuffer().length)
        .accounts({
          payer: payer.publicKey,
          sessionPayload: sessionPayloadPDA
        })
        .signers([payer])
        .rpc({ commitment: "confirmed" });

      await expect(
        mailbox.methods
          .deliverMessage(message.toHashBytes())
          .accounts({
            deliverer: payer.publicKey,
            inboundMessagePath: inboundMessagePathPDA,
            consortiumPayload: sessionPayloadPDA,
            consortiumValidatedPayload: validatedPayloadPDA
          })
          .signers([payer])
          .rpc({ commitment: "confirmed" })
      ).to.be.rejectedWith("ConstraintSeeds");
    });

    it("SessionPayloadPDA does not match hash", async function () {
      const otherMessage = new MessageV1(
        inboundMessagePath,
        ++globalNonce,
        user.publicKey.toBuffer(),
        mailboxReceiver.programId.toBuffer(),
        Buffer.from("test")
      );
      await consortiumUtility.createAndFinalizeSession(payer, otherMessage.toBuffer());

      await consortium.methods
        .postSessionPayload(otherMessage.toHashBytes(), otherMessage.toBuffer(), otherMessage.toBuffer().length)
        .accounts({
          payer: payer.publicKey,
          sessionPayload: otherMessage.sessionPayloadPDA(payer)
        })
        .signers([payer])
        .rpc({ commitment: "confirmed" });

      await expect(
        mailbox.methods
          .deliverMessage(message.toHashBytes())
          .accounts({
            deliverer: payer.publicKey,
            inboundMessagePath: inboundMessagePathPDA,
            consortiumPayload: otherMessage.sessionPayloadPDA(payer),
            consortiumValidatedPayload: validatedPayloadPDA
          })
          .signers([payer])
          .rpc({ commitment: "confirmed" })
      ).to.be.rejectedWith("consortium_payload. Error Code: ConstraintSeeds");
    });

    it("Invalid deliverer", async function () {
      await expect(
        mailbox.methods
          .deliverMessage(message.toHashBytes())
          .accounts({
            deliverer: user.publicKey,
            inboundMessagePath: inboundMessagePathPDA,
            consortiumPayload: sessionPayloadPDA,
            consortiumValidatedPayload: validatedPayloadPDA
          })
          .signers([user])
          .rpc({ commitment: "confirmed" })
      ).to.be.rejectedWith("consortium_payload. Error Code: ConstraintSeeds");
    });

    it("ValidatedPayloadPDA does not match hash", async function () {
      const otherMessage = new MessageV1(
        inboundMessagePath,
        ++globalNonce,
        user.publicKey.toBuffer(),
        mailboxReceiver.programId.toBuffer(),
        Buffer.from("test")
      );
      const otherValidatedPayloadPDA = (
        await consortiumUtility.createAndFinalizeSession(payer, otherMessage.toBuffer())
      ).validatedPayloadPDA;

      await expect(
        mailbox.methods
          .deliverMessage(message.toHashBytes())
          .accounts({
            deliverer: payer.publicKey,
            inboundMessagePath: inboundMessagePathPDA,
            consortiumPayload: sessionPayloadPDA,
            consortiumValidatedPayload: otherValidatedPayloadPDA
          })
          .signers([payer])
          .rpc({ commitment: "confirmed" })
      ).to.be.rejectedWith("consortium_validated_payload. Error Code: ConstraintSeeds");
    });

    it("deliverMessage rejects when message contains invalid path", async function () {
      const invalidMessagePath = Buffer.from(
        keccak256(Buffer.concat([LEDGER_MAILBOX_ADDRESS, BITCOIN_LCHAIN_ID, LCHAIN_ID])).slice(2),
        "hex"
      );

      const message = new MessageV1(
        invalidMessagePath,
        ++globalNonce,
        user.publicKey.toBuffer(),
        mailboxReceiver.programId.toBuffer(),
        Buffer.from("test")
      );
      const sessionPayloadPDA = message.sessionPayloadPDA(payer);
      const { validatedPayloadPDA } = await consortiumUtility.createAndFinalizeSession(payer, message.toBuffer());

      await consortium.methods
        .postSessionPayload(message.toHashBytes(), message.toBuffer(), message.toBuffer().length)
        .accounts({
          payer: payer.publicKey,
          sessionPayload: message.sessionPayloadPDA(payer)
        })
        .signers([payer])
        .rpc({ commitment: "confirmed" });

      await expect(
        mailbox.methods
          .deliverMessage(message.toHashBytes())
          .accounts({
            deliverer: payer.publicKey,
            inboundMessagePath: inboundMessagePathPDA,
            consortiumPayload: sessionPayloadPDA,
            consortiumValidatedPayload: validatedPayloadPDA
          })
          .signers([payer])
          .rpc({ commitment: "confirmed" })
      ).to.be.rejectedWith("InvalidMessagePath");
    });

    it("deliverMessage rejects on repeated call", async function () {
      const message = new MessageV1(
        inboundMessagePath,
        ++globalNonce,
        user.publicKey.toBuffer(),
        mailboxReceiver.programId.toBuffer(),
        Buffer.from("test")
      );
      const sessionPayloadPDA = message.sessionPayloadPDA(payer);
      const { validatedPayloadPDA } = await consortiumUtility.createAndFinalizeSession(payer, message.toBuffer());
      const messageInfoPDA = PublicKey.findProgramAddressSync(
        [Buffer.from("message"), message.toHash()],
        mailbox.programId
      )[0];

      await consortium.methods
        .postSessionPayload(message.toHashBytes(), message.toBuffer(), message.toBuffer().length)
        .accounts({
          payer: payer.publicKey,
          sessionPayload: message.sessionPayloadPDA(payer)
        })
        .signers([payer])
        .rpc({ commitment: "confirmed" });

      await mailbox.methods
        .deliverMessage(message.toHashBytes())
        .accounts({
          deliverer: payer.publicKey,
          inboundMessagePath: inboundMessagePathPDA,
          consortiumPayload: sessionPayloadPDA,
          consortiumValidatedPayload: validatedPayloadPDA
        })
        .signers([payer])
        .rpc({ commitment: "confirmed" });

      await expect(
        mailbox.methods
          .deliverMessage(message.toHashBytes())
          .accounts({
            deliverer: payer.publicKey,
            inboundMessagePath: inboundMessagePathPDA,
            consortiumPayload: sessionPayloadPDA,
            consortiumValidatedPayload: validatedPayloadPDA
          })
          .signers([payer])
          .rpc({ commitment: "confirmed" })
      ).to.be.rejectedWith(`account Address { address: ${messageInfoPDA.toBase58()}, base: None } already in use`);
    });

    it("deliverMessage rejects when selector is invalid", async function () {
      const message = new MessageV1(
        inboundMessagePath,
        ++globalNonce,
        user.publicKey.toBuffer(),
        mailboxReceiver.programId.toBuffer(),
        Buffer.from("test"),
        ZERO_BUFFER32,
        "aaaaaaaa"
      );
      const sessionPayloadPDA = message.sessionPayloadPDA(payer);
      const { validatedPayloadPDA } = await consortiumUtility.createAndFinalizeSession(payer, message.toBuffer());

      await consortium.methods
        .postSessionPayload(message.toHashBytes(), message.toBuffer(), message.toBuffer().length)
        .accounts({
          payer: payer.publicKey,
          sessionPayload: message.sessionPayloadPDA(payer)
        })
        .signers([payer])
        .rpc({ commitment: "confirmed" });

      await expect(
        mailbox.methods
          .deliverMessage(message.toHashBytes())
          .accounts({
            deliverer: payer.publicKey,
            inboundMessagePath: inboundMessagePathPDA,
            consortiumPayload: sessionPayloadPDA,
            consortiumValidatedPayload: validatedPayloadPDA
          })
          .signers([payer])
          .rpc({ commitment: "confirmed" })
      ).to.be.rejectedWith("InvalidPayloadSelector");
    });
  });

  describe("Handle message negative cases", () => {
    it("handleMessage rejects when it is not delivered", async function () {
      const message = new MessageV1(
        inboundMessagePath,
        ++globalNonce,
        user.publicKey.toBuffer(),
        mailboxReceiver.programId.toBuffer(),
        Buffer.from("test"),
        payer.publicKey.toBuffer(),
        MESSAGE_V1_SELECTOR
      );
      const sessionPayloadPDA = message.sessionPayloadPDA(payer);
      await consortiumUtility.createAndFinalizeSession(payer, message.toBuffer());

      await consortium.methods
        .postSessionPayload(message.toHashBytes(), message.toBuffer(), message.toBuffer().length)
        .accounts({
          payer: payer.publicKey,
          sessionPayload: sessionPayloadPDA
        })
        .signers([payer])
        .rpc({ commitment: "confirmed" });

      await expect(
        mailbox.methods
          .handleMessage(message.toHashBytes())
          .accounts({
            handler: user.publicKey,
            recipientProgram: mailboxReceiver.programId
          })
          .remainingAccounts([
            {
              pubkey: user.publicKey,
              isWritable: true,
              isSigner: true
            },
            {
              pubkey: message.receiverConfigPDA(),
              isWritable: false,
              isSigner: false
            },
            {
              pubkey: message.receiverMessageHandledPDA(),
              isWritable: true,
              isSigner: false
            },
            {
              pubkey: SystemProgram.programId,
              isWritable: false,
              isSigner: false
            }
          ])
          .signers([user])
          .rpc({ commitment: "confirmed" })
      ).to.be.rejectedWith("message_info. Error Code: AccountNotInitialized");
    });

    it("handleMessage rejects when recipient program is invalid", async function () {
      const message = new MessageV1(
        inboundMessagePath,
        ++globalNonce,
        user.publicKey.toBuffer(),
        mailboxReceiver.programId.toBuffer(),
        Buffer.from("test")
      );
      const sessionPayloadPDA = message.sessionPayloadPDA(payer);
      const { validatedPayloadPDA } = await consortiumUtility.createAndFinalizeSession(payer, message.toBuffer());

      await consortium.methods
        .postSessionPayload(message.toHashBytes(), message.toBuffer(), message.toBuffer().length)
        .accounts({
          payer: payer.publicKey,
          sessionPayload: sessionPayloadPDA
        })
        .signers([payer])
        .rpc({ commitment: "confirmed" });

      await mailbox.methods
        .deliverMessage(message.toHashBytes())
        .accounts({
          deliverer: payer.publicKey,
          inboundMessagePath: inboundMessagePathPDA,
          consortiumPayload: sessionPayloadPDA,
          consortiumValidatedPayload: validatedPayloadPDA
        })
        .signers([payer])
        .rpc({ commitment: "confirmed" });

      await expect(
        mailbox.methods
          .handleMessage(message.toHashBytes())
          .accounts({
            handler: payer.publicKey,
            recipientProgram: assetRouter.programId
          })
          .remainingAccounts([
            {
              pubkey: payer.publicKey,
              isWritable: true,
              isSigner: true
            },
            {
              pubkey: message.receiverConfigPDA(),
              isWritable: false,
              isSigner: false
            },
            {
              pubkey: message.receiverMessageHandledPDA(),
              isWritable: true,
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
      ).to.rejectedWith("recipient_program. Error Code: ConstraintAddress");
    });

    it("handleMessage rejects when dCaller is invalid", async function () {
      const message = new MessageV1(
        inboundMessagePath,
        ++globalNonce,
        user.publicKey.toBuffer(),
        mailboxReceiver.programId.toBuffer(),
        Buffer.from("test"),
        payer.publicKey.toBuffer(),
        MESSAGE_V1_SELECTOR
      );
      const sessionPayloadPDA = message.sessionPayloadPDA(payer);
      const { validatedPayloadPDA } = await consortiumUtility.createAndFinalizeSession(payer, message.toBuffer());

      await consortium.methods
        .postSessionPayload(message.toHashBytes(), message.toBuffer(), message.toBuffer().length)
        .accounts({
          payer: payer.publicKey,
          sessionPayload: sessionPayloadPDA
        })
        .signers([payer])
        .rpc({ commitment: "confirmed" });

      await mailbox.methods
        .deliverMessage(message.toHashBytes())
        .accounts({
          deliverer: payer.publicKey,
          inboundMessagePath: inboundMessagePathPDA,
          consortiumPayload: sessionPayloadPDA,
          consortiumValidatedPayload: validatedPayloadPDA
        })
        .signers([payer])
        .rpc({ commitment: "confirmed" });

      await expect(
        mailbox.methods
          .handleMessage(message.toHashBytes())
          .accounts({
            handler: user.publicKey,
            recipientProgram: mailboxReceiver.programId
          })
          .remainingAccounts([
            {
              pubkey: user.publicKey,
              isWritable: true,
              isSigner: true
            },
            {
              pubkey: message.receiverConfigPDA(),
              isWritable: false,
              isSigner: false
            },
            {
              pubkey: message.receiverMessageHandledPDA(),
              isWritable: true,
              isSigner: false
            },
            {
              pubkey: SystemProgram.programId,
              isWritable: false,
              isSigner: false
            }
          ])
          .signers([user])
          .rpc({ commitment: "confirmed" })
      ).to.be.rejectedWith("InvalidDestinationCaller");
    });
  });

  describe("Sender config", () => {
    const sender = Keypair.generate();
    const senderConfigPDA = PublicKey.findProgramAddressSync(
      [Buffer.from("sender_config"), sender.publicKey.toBuffer()],
      mailbox.programId
    )[0];

    it("setSenderConfig rejects when called by not admin", async () => {
      const maxPayloadSize = randomNumber(3);

      await expect(
        mailbox.methods
          .setSenderConfig(sender.publicKey, maxPayloadSize, true)
          .accounts({
            admin: payer.publicKey
          })
          .signers([payer])
          .rpc({ commitment: "confirmed" })
      ).to.be.rejectedWith("Unauthorized");
    });

    it("setSenderConfig successful by admin", async () => {
      const maxPayloadSize = randomNumber(3);

      await mailbox.methods
        .setSenderConfig(sender.publicKey, maxPayloadSize, true)
        .accounts({
          admin: admin.publicKey
        })
        .signers([admin])
        .rpc({ commitment: "confirmed" });

      const senderConfigAccount = await mailbox.account.senderConfig.fetch(senderConfigPDA);
      expect(senderConfigAccount.maxPayloadSize).to.be.eq(maxPayloadSize);
      expect(senderConfigAccount.feeDisabled).to.be.eq(true);
    });

    it("setSenderConfig update successful by admin", async () => {
      const maxPayloadSize = randomNumber(3);

      await mailbox.methods
        .setSenderConfig(sender.publicKey, maxPayloadSize, false)
        .accounts({
          admin: admin.publicKey
        })
        .signers([admin])
        .rpc({ commitment: "confirmed" });

      const senderConfigAccount = await mailbox.account.senderConfig.fetch(senderConfigPDA);
      expect(senderConfigAccount.maxPayloadSize).to.be.eq(maxPayloadSize);
      expect(senderConfigAccount.feeDisabled).to.be.eq(false);
    });

    it("setSenderConfig rejects when called by not admin", async () => {
      await expect(
        mailbox.methods
          .unsetSenderConfig(sender.publicKey)
          .accounts({
            admin: payer.publicKey
          })
          .signers([payer])
          .rpc({ commitment: "confirmed" })
      ).to.be.rejectedWith("Unauthorized");
    });

    it("unsetSenderConfig successful by admin", async () => {
      await mailbox.methods
        .unsetSenderConfig(sender.publicKey)
        .accounts({
          admin: admin.publicKey
        })
        .signers([admin])
        .rpc({ commitment: "confirmed" });

      expect(await provider.connection.getAccountInfo(senderConfigPDA)).to.be.null;
    });
  });

  describe("Send message", () => {
    const customMaxPayloadSize = defaultMaxPayloadSize + 10;
    const MsgSentEvents = [];
    const listeners: number[] = [];

    before("Enable outbound message path", async () => {
      listeners.push(
        programEventManager.addEventListener("messageSent", e => {
          console.log(JSON.stringify(e));
          MsgSentEvents.push(e);
        })
      );

      await mailbox.methods
        .enableOutboundMessagePath(LEDGER_LCHAIN_ID_BZ)
        .accounts({
          admin: admin.publicKey,
        })
        .signers([admin])
        .rpc({ commitment: "confirmed" });

      await mailbox.methods
        .setSenderConfig(payerFeeExempt.publicKey, customMaxPayloadSize, true)
        .accounts({
          admin: admin.publicKey
        })
        .signers([admin])
        .rpc({ commitment: "confirmed" });
    });

    afterEach(async function () {
      MsgSentEvents.length = 0;
    });

    after(async function () {
      for (const l of listeners) {
        await programEventManager.removeEventListener(l);
      }
    });

    it("send message by paying GMP fee", async () => {
      let config = await mailbox.account.config.fetch(configPDA);
      let body = Buffer.from("some body to send", "utf8");
      let recipient = Buffer.from(sha256("recipient"), "hex");
      let recipientBz = Array.from(Uint8Array.from(recipient));
      let destinationCaller = Buffer.from(sha256("destinationCaller"), "hex");
      let destinationCallerBz = Array.from(Uint8Array.from(destinationCaller));
      const outboundMessagePDA = PublicKey.findProgramAddressSync(
        [Buffer.from("outbound_message"), config.globalNonce.toArrayLike(Buffer, "be", 8)],
        mailbox.programId
      )[0];
      console.log("global nonce:", config.globalNonce.toNumber());

      const balanceBefore = await provider.connection.getBalance(payer.publicKey);
      const treasuryBalanceBefore = await provider.connection.getBalance(treasury.publicKey);

      await mailbox.methods
        .sendMessage(body, recipientBz, destinationCallerBz)
        .accountsPartial({
          feePayer: payer.publicKey,
          senderAuthority: payer.publicKey,
          outboundMessage: outboundMessagePDA,
          outboundMessagePath: outboundMessagePathPDA,
          treasury: treasury.publicKey,
          senderConfig: null
        })
        .signers([payer])
        .rpc({ commitment: "confirmed" });

      const outboundMessage = await mailbox.account.outboundMessage.fetch(outboundMessagePDA);
      expect(outboundMessage[0].body).to.deep.eq(body);
      expect(outboundMessage[0].recipient).to.deep.eq(recipientBz);
      expect(outboundMessage[0].destinationCaller).to.deep.eq(destinationCallerBz);
      expect(outboundMessage[0].nonce).to.deep.eq(config.globalNonce);
      expect(outboundMessage[0].messagePathIdentifier).to.deep.eq(outboundMessagePathBytes);
      // todo: change to a sender program when implemented
      expect(outboundMessage[0].sender).to.deep.eq(Array.from(Uint8Array.from(SystemProgram.programId.toBuffer())));

      // 260 is the size of the gmp message in bytes assuming body is less than 32 bytes
      const fee = feePerByte.muln(260);

      const treasuryBalanceAfter = await provider.connection.getBalance(treasury.publicKey);
      expect(treasuryBalanceAfter).to.be.eq(treasuryBalanceBefore + fee.toNumber(), "treasury balance mismatch");

      const balanceAfter = await provider.connection.getBalance(payer.publicKey);
      // gmp fee + instruction fee should have been deducted, and assume gmp fee is greater than gas + instr fee
      expect(balanceAfter).to.be.lt(balanceBefore - fee.toNumber(), "fee not paid");
    });

    it("send message exempt from GMP fee", async () => {
      let config = await mailbox.account.config.fetch(configPDA);
      let body = Buffer.from("some body to send", "utf8");
      let recipient = Buffer.from(sha256("recipient"), "hex");
      let recipientBz = Array.from(Uint8Array.from(recipient));
      let destinationCaller = Buffer.from(sha256("destinationCaller"), "hex");
      let destinationCallerBz = Array.from(Uint8Array.from(destinationCaller));
      const outboundMessagePDA = PublicKey.findProgramAddressSync(
        [Buffer.from("outbound_message"), config.globalNonce.toArrayLike(Buffer, "be", 8)],
        mailbox.programId
      )[0];
      console.log("global nonce:", config.globalNonce.toNumber());

      // we use system program just for ease of testing
      await mailbox.methods
        .setSenderConfig(SystemProgram.programId, customMaxPayloadSize, true)
        .accounts({
          admin: admin.publicKey
        })
        .signers([admin])
        .rpc({ commitment: "confirmed" });

      const balanceBefore = await provider.connection.getBalance(payerFeeExempt.publicKey);
      const treasuryBalanceBefore = await provider.connection.getBalance(treasury.publicKey);

      await mailbox.methods
        .sendMessage(body, recipientBz, destinationCallerBz)
        .accountsPartial({
          feePayer: payerFeeExempt.publicKey,
          senderAuthority: payerFeeExempt.publicKey,
          outboundMessage: outboundMessagePDA,
          outboundMessagePath: outboundMessagePathPDA,
          senderConfig: systemProgramSenderConfigPDA,
          treasury: null
        })
        .signers([payerFeeExempt])
        .rpc({ commitment: "confirmed" });

      const outboundMessage = await mailbox.account.outboundMessage.fetch(outboundMessagePDA);
      expect(outboundMessage[0].body).to.deep.eq(body);
      expect(outboundMessage[0].recipient).to.deep.eq(recipientBz);
      expect(outboundMessage[0].destinationCaller).to.deep.eq(destinationCallerBz);
      expect(outboundMessage[0].nonce).to.deep.eq(config.globalNonce);
      expect(outboundMessage[0].messagePathIdentifier).to.deep.eq(outboundMessagePathBytes);
      // todo: change to a sender program when implemented
      expect(outboundMessage[0].sender).to.deep.eq(Array.from(Uint8Array.from(SystemProgram.programId.toBuffer())));

      // 260 is the size of the gmp message in bytes assuming body is less than 32 bytes
      const fee = feePerByte.muln(260);

      // treasury balance didnt change
      const treasuryBalanceAfter = await provider.connection.getBalance(treasury.publicKey);
      expect(treasuryBalanceAfter).to.be.eq(treasuryBalanceBefore);

      const balanceAfter = await provider.connection.getBalance(payerFeeExempt.publicKey);
      expect(balanceAfter).to.be.gt(balanceBefore - fee.toNumber());

      //Event
      expect(MsgSentEvents[0]).to.be.not.undefined;
      expect(MsgSentEvents[0].nonce.toNumber()).to.be.deep.eq(config.globalNonce.toNumber());
    });

    it("sendMessage rejects when body is greater than max", async () => {
      let config = await mailbox.account.config.fetch(configPDA);
      let body = Buffer.alloc(customMaxPayloadSize, 0x01);
      let recipient = Buffer.from(sha256("recipient"), "hex");
      let recipientBz = Array.from(Uint8Array.from(recipient));
      let destinationCaller = Buffer.from(sha256("destinationCaller"), "hex");
      let destinationCallerBz = Array.from(Uint8Array.from(destinationCaller));
      const outboundMessagePDA = PublicKey.findProgramAddressSync(
        [Buffer.from("outbound_message"), config.globalNonce.toArrayLike(Buffer, "be", 8)],
        mailbox.programId
      )[0];

      await expect(
        mailbox.methods
          .sendMessage(body, recipientBz, destinationCallerBz)
          .accountsPartial({
            feePayer: payer.publicKey,
            senderAuthority: payer.publicKey,
            outboundMessage: outboundMessagePDA,
            outboundMessagePath: outboundMessagePathPDA,
            treasury: treasury.publicKey,
            senderConfig: null
          })
          .signers([payer])
          .rpc({ commitment: "confirmed" })
      ).to.be.rejectedWith("PayloadTooLarge");
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
      await mailbox.methods
        .grantAccountRole(pauser.publicKey, { pauser: {} })
        .accounts({ admin: admin.publicKey })
        .signers([admin])
        .rpc({ commitment: "confirmed" });
    });

    it("Pause rejects when called by not pauser", async () => {
      await expect(
        mailbox.methods.pause().accounts({ pauser: payer.publicKey }).signers([payer]).rpc()
      ).to.be.rejectedWith("AccountNotInitialized");
    });

    it("Pauser can set on pause", async () => {
      await mailbox.methods
        .pause()
        .accounts({ pauser: pauser.publicKey })
        .signers([pauser])
        .rpc({ commitment: "confirmed" });

      expect(PauseEvents[0]).to.be.not.undefined;
      expect(PauseEvents[0].paused).to.be.true;
    });

    it("Pause rejects when contract is already paused", async () => {
      await expect(
        mailbox.methods.pause().accounts({ pauser: pauser.publicKey }).signers([pauser]).rpc()
      ).to.be.rejectedWith("Paused");
    });

    //Deliver
    it("deliverMessage rejects when paused", async function () {
      const message = new MessageV1(
        inboundMessagePath,
        ++globalNonce,
        user.publicKey.toBuffer(),
        mailboxReceiver.programId.toBuffer(),
        Buffer.from("test")
      );
      const sessionPayloadPDA = message.sessionPayloadPDA(payer);
      const { validatedPayloadPDA } = await consortiumUtility.createAndFinalizeSession(payer, message.toBuffer());

      await consortium.methods
        .postSessionPayload(message.toHashBytes(), message.toBuffer(), message.toBuffer().length)
        .accounts({
          payer: payer.publicKey,
          sessionPayload: message.sessionPayloadPDA(payer)
        })
        .signers([payer])
        .rpc({ commitment: "confirmed" });

      await expect(
        mailbox.methods
          .deliverMessage(message.toHashBytes())
          .accounts({
            deliverer: payer.publicKey,
            inboundMessagePath: inboundMessagePathPDA,
            consortiumPayload: sessionPayloadPDA,
            consortiumValidatedPayload: validatedPayloadPDA
          })
          .signers([payer])
          .rpc()
      ).to.be.rejectedWith("Paused");
    });

    //Send
    it("sendMessage rejects when paused", async () => {
      let config = await mailbox.account.config.fetch(configPDA);
      let body = Buffer.alloc(defaultMaxPayloadSize, 0x01);
      let recipient = Buffer.from(sha256("recipient"), "hex");
      let recipientBz = Array.from(Uint8Array.from(recipient));
      let destinationCaller = Buffer.from(sha256("destinationCaller"), "hex");
      let destinationCallerBz = Array.from(Uint8Array.from(destinationCaller));
      const outboundMessagePDA = PublicKey.findProgramAddressSync(
        [Buffer.from("outbound_message"), config.globalNonce.toArrayLike(Buffer, "be", 8)],
        mailbox.programId
      )[0];

      await expect(
        mailbox.methods
          .sendMessage(body, recipientBz, destinationCallerBz)
          .accountsPartial({
            feePayer: payer.publicKey,
            senderAuthority: payer.publicKey,
            outboundMessage: outboundMessagePDA,
            outboundMessagePath: outboundMessagePathPDA,
            treasury: treasury.publicKey,
            senderConfig: null
          })
          .signers([payer])
          .rpc({ commitment: "confirmed" })
      ).to.be.rejectedWith("Paused");
    });

    it("Pauser can not disable pause", async () => {
      await expect(
        mailbox.methods.unpause().accounts({ admin: pauser.publicKey }).signers([pauser]).rpc()
      ).to.be.rejectedWith("Unauthorized");
    });

    it("Admin can disable pause", async () => {
      await mailbox.methods
        .unpause()
        .accounts({ admin: admin.publicKey })
        .signers([admin])
        .rpc({ commitment: "confirmed" });

      expect(PauseEvents[0]).to.be.not.undefined;
      expect(PauseEvents[0].paused).to.be.false;
    });
  });
});
