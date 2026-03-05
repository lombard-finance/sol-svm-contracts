import { Mailbox } from "../target/types/mailbox";
import * as anchor from "@coral-xyz/anchor";
import { BN, Program } from "@coral-xyz/anchor";
import { Keypair, PublicKey } from "@solana/web3.js";
import { keccak256, sha256, ethers } from "ethers";
import { ConsortiumUtility } from "./consortium_utilities";
import { Consortium } from "../target/types/consortium";

const consortium = anchor.workspace.Consortium as Program<Consortium>;
const mailbox = anchor.workspace.Mailbox as Program<Mailbox>;

const MESSAGE_V1_SELECTOR = "e288fb4a";

export class MailboxUtilities {
  consortiumUtility: ConsortiumUtility;
  selfChainId: Buffer;
  admin: Keypair;
  treasury: PublicKey;

  constructor(consortiumUtility: ConsortiumUtility, selfChainId: Buffer, admin: Keypair, treasury: PublicKey) {
    this.consortiumUtility = consortiumUtility;
    this.selfChainId = selfChainId;
    this.admin = admin;
    this.treasury = treasury;
  }

  async initialize(lchainId: Buffer) {
    const defaultMaxPayloadSize = 1000;
    const feePerByte = new BN(1000);
    const tx = await mailbox.methods
      .initialize(this.admin.publicKey, consortium.programId, this.treasury, defaultMaxPayloadSize, feePerByte, Array.from(Uint8Array.from(lchainId)))
      .accounts({
        deployer: consortium.provider.wallet.publicKey,
      })
      .signers([Keypair.fromSecretKey(consortium.provider.wallet.payer.secretKey)])
      .rpc();
    await consortium.provider.connection.confirmTransaction(tx);
  }

  async enableInboundMessagePath(foreignMailboxAddress: Buffer, foreignLchainId: Buffer) {
    const tx = await mailbox.methods
      .enableInboundMessagePath(Array.from(Uint8Array.from(foreignMailboxAddress)), Array.from(Uint8Array.from(foreignLchainId)))
      .accounts({
        admin: this.admin.publicKey,
        inboundMessagePath: this.getInboundMessagePathPDA(foreignMailboxAddress, foreignLchainId),
      })
      .signers([this.admin])
      .rpc();
    await consortium.provider.connection.confirmTransaction(tx);
  }

  async enableOutboundMessagePath(targetChainId: Buffer) {
    const tx = await mailbox.methods
      .enableOutboundMessagePath(Array.from(Uint8Array.from(targetChainId)))
      .accounts({
        admin: this.admin.publicKey,
        outboundMessagePath: this.getOutboundMessagePathPDA(targetChainId),
      })
      .signers([this.admin])
      .rpc();
    await consortium.provider.connection.confirmTransaction(tx);
  }

  getOutboundMessagePathPDA(targetChainId: Buffer) {
    const outboundMessagePath = Buffer.from(keccak256((Buffer.concat([mailbox.programId.toBuffer(), this.selfChainId, targetChainId]))).slice(2), "hex");
    return PublicKey.findProgramAddressSync([Buffer.from("outbound_message_path"), outboundMessagePath], mailbox.programId)[0];
  }

  getInboundMessagePathPDA(foreignMailboxAddress: Buffer, foreignLchainId: Buffer) {
    const inboundMessagePath = Buffer.from(keccak256((Buffer.concat([foreignMailboxAddress, foreignLchainId, this.selfChainId]))).slice(2), "hex");
    return PublicKey.findProgramAddressSync([Buffer.from("inbound_message_path"), inboundMessagePath], mailbox.programId)[0];
  }

  getSenderConfigPDA(sender: PublicKey) {
    return PublicKey.findProgramAddressSync([Buffer.from("sender_config"), sender.toBuffer()], mailbox.programId)[0];
  }

  async setSenderConfig(sender: PublicKey, maxPayload: number, feeDisabled: boolean) {
    const tx = await mailbox.methods
      .setSenderConfig(sender, maxPayload, feeDisabled)
      .accounts({
        admin: this.admin.publicKey,
      })
      .signers([this.admin])
      .rpc();
    await consortium.provider.connection.confirmTransaction(tx);
  }

  async deliverMessage(fromMailboxAddress: Buffer, fromLchainId: Buffer, payer: Keypair, message: Buffer) {
    await this.consortiumUtility.createAndFinalizeSession(consortium, payer, message);
    const payloadHash = Buffer.from(sha256(message).slice(2), "hex");
    const payloadHashBytes = Array.from(Uint8Array.from(payloadHash));
    const sessionPayloadPDA = PublicKey.findProgramAddressSync(
      [Buffer.from("session_payload"), payer.publicKey.toBuffer(), payloadHash],
      consortium.programId
    )[0];
    const postSessionPayloadTx = await consortium.methods
      .postSessionPayload(payloadHashBytes, message, message.length)
      .accounts({
        payer: payer.publicKey,
        sessionPayload: sessionPayloadPDA,
      })
      .signers([payer])
      .rpc();
    await consortium.provider.connection.confirmTransaction(postSessionPayloadTx);

    const deliverMessageTx = await mailbox.methods
      .deliverMessage(payloadHashBytes)
      .accounts({
        deliverer: payer.publicKey,
        inboundMessagePath: this.getInboundMessagePathPDA(fromMailboxAddress, fromLchainId),
        consortiumPayload: sessionPayloadPDA,
        consortiumValidatedPayload: this.consortiumUtility.getValidatedPayloadPDA(consortium, payloadHash),
      })
      .signers([payer])
      .rpc();
    await mailbox.provider.connection.confirmTransaction(deliverMessageTx);
  }

  static getMailboxConfigPDA() {
    return PublicKey.findProgramAddressSync([Buffer.from("mailbox_config")], mailbox.programId)[0];
  }

  static async getCurrentOutboundMessagePDA() {
    const config = await mailbox.account.config.fetch(MailboxUtilities.getMailboxConfigPDA());
    return PublicKey.findProgramAddressSync(
      [Buffer.from("outbound_message"), config.globalNonce.toArrayLike(Buffer, "be", 8)],
      mailbox.programId
    )[0];
  }
}

export function messageV1(
	messagePathIdentifier: Buffer,
	nonce: number,
	sender: Buffer,
	recipient: Buffer,
	destinationCaller: Buffer,
	body: Buffer,
): Buffer {
	return Buffer.concat([
		Buffer.from(MESSAGE_V1_SELECTOR, "hex"),
		Buffer.from(ethers.AbiCoder.defaultAbiCoder().encode(
			["bytes32", "uint256", "bytes32", "bytes32", "bytes32", "bytes"],
			[messagePathIdentifier, nonce, sender, recipient, destinationCaller, body]
		).slice(2), "hex")
	]);
}