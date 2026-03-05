import "dotenv/config";
import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { PublicKey, Keypair, LAMPORTS_PER_SOL, SystemProgram } from "@solana/web3.js";
import * as spl from "@solana/spl-token";
import { Consortium } from "../target/types/consortium";
import { Mailbox } from "../target/types/mailbox";
import { sha256 } from "js-sha256";
import bs58 from "bs58";
import nacl from "tweetnacl";
import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import { ConsortiumUtility } from "./consortium_utilities";
import { keccak256 } from "ethers";
import { MailboxReceiver } from "../target/types/mailbox_receiver";
import { messageV1 } from "./mailbox_utilities";

chai.use(chaiAsPromised);
const expect = chai.expect;

describe("Mailbox", () => {
	const provider = anchor.AnchorProvider.env();
	anchor.setProvider(provider);

	const consortium = anchor.workspace.Consortium as Program<Consortium>;
	const mailbox = anchor.workspace.Mailbox as Program<Mailbox>;

	let consortiumUtility: ConsortiumUtility;
	let payer: Keypair;
	let payerFeeExempt: Keypair;
	let treasury: Keypair;
	let user: Keypair;
	let admin: Keypair;
	let configPDA: PublicKey;
	let pauser: Keypair;

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
	payerFeeExempt = Keypair.generate();
	treasury = Keypair.generate();
	user = Keypair.generate();
	admin = Keypair.generate();
	pauser = Keypair.generate();
	const t = Keypair.generate();

	const lchainId = Buffer.from("02296998a6f8e2a784db5d9f95e18fc23f70441a1039446801089879b08c7ef0", "hex");
	const foreignLchainId = Buffer.from(sha256("foreign-lchain-id"), "hex");
	const foreignMailboxAddress = Buffer.from(sha256("foreign-mailbox-address"), "hex");
	const inboundMessagePath = Buffer.from(keccak256(Buffer.concat([foreignMailboxAddress, foreignLchainId, lchainId])).slice(2), "hex");
	const inboundMessagePathPDA = PublicKey.findProgramAddressSync([Buffer.from("inbound_message_path"), foreignLchainId], mailbox.programId)[0];
	const outboundMessagePath = Buffer.from(keccak256((Buffer.concat([mailbox.programId.toBuffer(), lchainId, foreignLchainId]))).slice(2), "hex");
	const outboundMessagePathPDA = PublicKey.findProgramAddressSync([Buffer.from("outbound_message_path"), foreignLchainId], mailbox.programId)[0];
	const accountRolesPauserPDA = PublicKey.findProgramAddressSync([Buffer.from("account_roles"), pauser.publicKey.toBuffer()], mailbox.programId)[0];
	const lchainIdBytes = Array.from(Uint8Array.from(lchainId));
	const foreignLchainIdBytes = Array.from(Uint8Array.from(foreignLchainId));
	const foreignMailboxAddressBytes = Array.from(Uint8Array.from(foreignMailboxAddress));
	const inboundMessagePathBytes = Array.from(Uint8Array.from(inboundMessagePath));
	const outboundMessagePathBytes = Array.from(Uint8Array.from(outboundMessagePath));
	const systemProgramSenderConfigPDA = PublicKey.findProgramAddressSync([Buffer.from("sender_config"), SystemProgram.programId.toBuffer()], mailbox.programId)[0];

	const defaultMaxPayloadSize = 1000;
	// tests rely on the fact that minimum fee for a legitimate gmp message e.g. 260 * feePerByte
	// is greater than the fee payed for gas and rent of the instruction under test
	// this is just for ease of assertions to avoid to exactly calculate the instruction fee
    const feePerByte = new BN(1000000);

	before("fund wallets and initialize consortium utility", async () => {
		await fundWallet(payer, 25 * LAMPORTS_PER_SOL);
		await fundWallet(payerFeeExempt, 25 * LAMPORTS_PER_SOL);
		await fundWallet(user, 25 * LAMPORTS_PER_SOL);
		await fundWallet(admin, 25 * LAMPORTS_PER_SOL);

		await fundWallet(t, 25 * LAMPORTS_PER_SOL);

		[configPDA] = PublicKey.findProgramAddressSync([Buffer.from("mailbox_config")], mailbox.programId);

		consortiumUtility = new ConsortiumUtility();
		consortiumUtility.generateAndAddKeypairs(3);
		await consortiumUtility.initializeConsortiumProgram(consortium, admin);

	});

	describe("Initialize and set roles", function () {
		it("initialize: fails when payer is not deployer", async () => {
		await expect(
			mailbox.methods
			.initialize(admin.publicKey, consortium.programId, treasury.publicKey, defaultMaxPayloadSize, feePerByte)
			.accounts({
				deployer: payer.publicKey,
			})
			.signers([payer])
			.rpc()
		).to.be.rejectedWith("Unauthorized function call");
		});

		it("initialize: successful", async () => {
		const tx = await mailbox.methods
			.initialize(admin.publicKey, consortium.programId, treasury.publicKey, defaultMaxPayloadSize, feePerByte)
			.accounts({
			deployer: provider.wallet.publicKey,
			})
			.signers([Keypair.fromSecretKey(provider.wallet.payer.secretKey)])
			.rpc();
		await provider.connection.confirmTransaction(tx);
		const cfg = await mailbox.account.config.fetch(configPDA);
		expect(cfg.admin.toBase58()).to.be.eq(admin.publicKey.toBase58());
				// todo: check all fields
		});
  });

  describe("grant and revoke roles", () => {
		it("grant role", async () => {
			const tx = await mailbox.methods
				.grantAccountRole(pauser.publicKey, { "pauser": {} })
				.accounts({
					admin: admin.publicKey,
				})
				.signers([admin])
				.rpc();
			await provider.connection.confirmTransaction(tx);
			const accountRoles = await mailbox.account.accountRoles.fetch(accountRolesPauserPDA);
			expect(accountRoles.roles).to.be.deep.eq([{ "pauser": {} }]);
		})
		it("revoke role", async () => {
			const tx = await mailbox.methods
				.revokeAccountRoles(pauser.publicKey)
				.accounts({
					admin: admin.publicKey,
				})
				.signers([admin])
				.rpc();
			await provider.connection.confirmTransaction(tx);
			// Check that the account roles PDA was closed (account no longer exists)
			await expect(
				mailbox.account.accountRoles.fetch(accountRolesPauserPDA)
			).to.be.rejectedWith(/Account does not exist|AccountNotFound/);
		})
	})

	describe("messaging paths", () => {
		it("enable inbound messaging path", async () => {
			const tx = await mailbox.methods
				.enableInboundMessagePath(foreignLchainIdBytes, foreignMailboxAddressBytes)
				.accounts({
					admin: admin.publicKey,
				})
				.signers([admin])
				.rpc();
			await provider.connection.confirmTransaction(tx);
			const inboundMessagePathAccount = await mailbox.account.inboundMessagePath.fetch(inboundMessagePathPDA);
			expect(inboundMessagePathAccount.sourceMailboxAddress).to.be.deep.eq(foreignMailboxAddressBytes);
			expect(inboundMessagePathAccount.sourceChainId).to.be.deep.eq(foreignLchainIdBytes);
			expect(inboundMessagePathAccount.identifier).to.be.deep.eq(inboundMessagePathBytes);
		})
		it("enable outbound messaging path", async () => {
			const tx = await mailbox.methods
				.enableOutboundMessagePath(foreignLchainIdBytes)
				.accounts({
					admin: admin.publicKey,
				})
				.signers([admin])
				.rpc();
			await provider.connection.confirmTransaction(tx);
			const outboundMessagePathAccount = await mailbox.account.outboundMessagePath.fetch(outboundMessagePathPDA);
			expect(outboundMessagePathAccount.destinationChainId).to.be.deep.eq(foreignLchainIdBytes);
		})
		it("disable inbound messaging path", async () => {
			const tx = await mailbox.methods
				.disableInboundMessagePath(foreignLchainIdBytes)
				.accounts({
					admin: admin.publicKey,
				})
				.signers([admin])
				.rpc();
			await provider.connection.confirmTransaction(tx);
			// Check that the inbound message path PDA was closed (account no longer exists)
			await expect(
				mailbox.account.inboundMessagePath.fetch(inboundMessagePathPDA)
			).to.be.rejectedWith(/Account does not exist|AccountNotFound/);
		})
		it("disable outbound messaging path", async () => {
			const tx = await mailbox.methods
				.disableOutboundMessagePath(foreignLchainIdBytes)
				.accounts({
					admin: admin.publicKey,
				})
				.signers([admin])
				.rpc();
			await provider.connection.confirmTransaction(tx);
			// Check that the outbound message path PDA was closed (account no longer exists)
			await expect(
				mailbox.account.outboundMessagePath.fetch(outboundMessagePathPDA)
			).to.be.rejectedWith(/Account does not exist|AccountNotFound/);
		})
	})

	describe("incoming message", () => {
		const mailboxReceiver = anchor.workspace.MailboxReceiver as Program<MailboxReceiver>;

		const zeroBuffer32 = Buffer.alloc(32, 0);
		const message = messageV1(inboundMessagePath, 0, user.publicKey.toBuffer(), mailboxReceiver.programId.toBuffer(), zeroBuffer32, Buffer.from("test"));
		const payloadHash = Buffer.from(sha256(message), "hex");
		const payloadHashBytes = Array.from(Uint8Array.from(payloadHash));

		const sessionPDA = PublicKey.findProgramAddressSync(
			[Buffer.from("session"), payer.publicKey.toBuffer(), payloadHash],
			consortium.programId
		)[0];
		const validatedPayloadPDA = PublicKey.findProgramAddressSync(
			[Buffer.from("validated_payload"), payloadHash],
			consortium.programId
		)[0];
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

		// enable inbound message path before the test
		before(async () => {
			const tx = await mailbox.methods
				.enableInboundMessagePath(foreignLchainIdBytes, foreignMailboxAddressBytes)
				.accounts({
					admin: admin.publicKey,
				})
				.signers([admin])
				.rpc();
			await provider.connection.confirmTransaction(tx);
			const tx2 = await mailboxReceiver.methods
				.initialize(mailbox.programId)
				.accounts({
          deployer: provider.wallet.publicKey,
        })
        .signers([Keypair.fromSecretKey(provider.wallet.payer.secretKey)])
        .rpc();
			await provider.connection.confirmTransaction(tx2);
		})

		// disable inbound message path after the test
		after(async () => {
			const tx = await mailbox.methods
				.disableInboundMessagePath(foreignLchainIdBytes)
				.accounts({
					admin: admin.publicKey,
				})
				.signers([admin])
				.rpc();
			await provider.connection.confirmTransaction(tx);
		})
		
		it("deliver message", async () => {
			await consortiumUtility.createAndFinalizeSession(consortium, payer, message);

			const postSessionPayloadTx = await consortium.methods
				.postSessionPayload(payloadHashBytes, message, message.length)
				.accounts({
					payer: payer.publicKey,
					sessionPayload: sessionPayloadPDA,
				})
				.signers([payer])
				.rpc();
			await provider.connection.confirmTransaction(postSessionPayloadTx);

			const deliverMessageTx = await mailbox.methods
				.deliverMessage(payloadHashBytes)
				.accounts({
					deliverer: payer.publicKey,
					inboundMessagePath: inboundMessagePathPDA,
					consortiumPayload: sessionPayloadPDA,
					consortiumValidatedPayload: validatedPayloadPDA,
				})
				.signers([payer])
				.rpc();
			await provider.connection.confirmTransaction(deliverMessageTx);
			const messageInfo = await mailbox.account.messageV1Info.fetch(messageInfoPDA);
			expect(messageInfo.status['delivered']).to.deep.eq({});
		})
		it("handles the message", async () => {
			const handleMessageTx = await mailbox.methods
				.handleMessage(payloadHashBytes)
				.accounts({
					handler: payer.publicKey,
					recipientProgram: mailboxReceiver.programId,
				})
				.remainingAccounts([
					{
						pubkey: payer.publicKey,
						isWritable: true,
						isSigner: true,
					},
					{
						pubkey: receiverConfigPDA,
						isWritable: false,
						isSigner: false,
					},
					{
						pubkey: receiverMessageHandledPDA,
						isWritable: true,
						isSigner: false,
					},
					{
						pubkey: SystemProgram.programId,
						isWritable: false,
						isSigner: false,
					}
				])
				.signers([payer])
				.rpc();
			await provider.connection.confirmTransaction(handleMessageTx);
			const messageInfo = await mailbox.account.messageV1Info.fetch(messageInfoPDA);
			expect(messageInfo.status['handled']).to.deep.eq({});
			await expect(mailboxReceiver.account.messageHandled.fetch(receiverMessageHandledPDA)).to.not.be.rejected;
		})
	})

	describe("sender config", () => {
		it("set", async () => {
			
		})

		it("update", async () => {
			
		})

		it("unset", async () => {

		})
	})

	describe("outgoing message", () => {

		const customMaxPayloadSize = defaultMaxPayloadSize + 100;

		// enable outbound message path before the test
		before(async () => {
			const tx = await mailbox.methods
				.enableOutboundMessagePath(foreignLchainIdBytes)
				.accounts({
					admin: admin.publicKey,
				})
				.signers([admin])
				.rpc();
			await provider.connection.confirmTransaction(tx);
		});
		
		// disable outbound message path after the test
		after(async () => {
			const tx = await mailbox.methods
				.disableOutboundMessagePath(foreignLchainIdBytes)
				.accounts({
					admin: admin.publicKey,
				})
				.signers([admin])
				.rpc();
			await provider.connection.confirmTransaction(tx);
		})

		it("send message by paying GMP fee", async () => {
			let config = await mailbox.account.config.fetch(configPDA);
			let body = Buffer.from("some body to send", "utf8");
			let recipient = Buffer.from(sha256("recipient"), "hex")
			let recipientBz = Array.from(Uint8Array.from(recipient));
			let destinationCaller = Buffer.from(sha256("destinationCaller"), "hex");
			let destinationCallerBz = Array.from(Uint8Array.from(destinationCaller));
			const outboundMessagePDA = PublicKey.findProgramAddressSync(
				[Buffer.from("outbound_message"), config.globalNonce.toArrayLike(Buffer, "be", 8)],
				mailbox.programId
			)[0];

			const balanceBefore = await provider.connection.getBalance(payer.publicKey);
			const treasuryBalanceBefore = await provider.connection.getBalance(treasury.publicKey);

			const sendMessageTx = await mailbox.methods
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
				.rpc();
			await provider.connection.confirmTransaction(sendMessageTx);

			const outboundMessage = await mailbox.account.outboundMessage.fetch(outboundMessagePDA);
			expect(outboundMessage[0].body).to.deep.eq(body);
			expect(outboundMessage[0].recipient).to.deep.eq(recipientBz);
			expect(outboundMessage[0].destinationCaller).to.deep.eq(destinationCallerBz);
			expect(outboundMessage[0].nonce).to.deep.eq(config.globalNonce);
			expect(outboundMessage[0].messagePathIdentifier).to.deep.eq(outboundMessagePathBytes);
			// todo: change to a sender program when implemented
			expect(outboundMessage[0].sender).to.deep.eq(Array.from(Uint8Array.from(SystemProgram.programId.toBuffer())));

			// 260 is the size of the gmp message in bytes assuming body is less than 32 bytes
			const fee = feePerByte.muln(260)

			const treasuryBalanceAfter = await provider.connection.getBalance(treasury.publicKey);
			expect(treasuryBalanceAfter).to.be.eq(treasuryBalanceBefore + fee.toNumber(), "treasury balance mismatch");

			const balanceAfter = await provider.connection.getBalance(payer.publicKey);
			// gmp fee + instruction fee should have been deducted, and assume gmp fee is greater than gas + instr fee
			expect(balanceAfter).to.be.lt(balanceBefore - fee.toNumber(), "fee not paid");
		})

		it("send message exempt from GMP fee", async () => {
			let config = await mailbox.account.config.fetch(configPDA);
			let body = Buffer.from("some body to send", "utf8");
			let recipient = Buffer.from(sha256("recipient"), "hex")
			let recipientBz = Array.from(Uint8Array.from(recipient));
			let destinationCaller = Buffer.from(sha256("destinationCaller"), "hex");
			let destinationCallerBz = Array.from(Uint8Array.from(destinationCaller));
			const outboundMessagePDA = PublicKey.findProgramAddressSync(
				[Buffer.from("outbound_message"), config.globalNonce.toArrayLike(Buffer, "be", 8)],
				mailbox.programId
			)[0];

			// we use system program just for ease of testing
			const senderConfigTx = await mailbox.methods
				.setSenderConfig(SystemProgram.programId, customMaxPayloadSize, true)
				.accounts({
					admin: admin.publicKey,
				})
				.signers([admin])
				.rpc();
			await provider.connection.confirmTransaction(senderConfigTx);

			const balanceBefore = await provider.connection.getBalance(payerFeeExempt.publicKey);

			const sendMessageTx = await mailbox.methods
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
				.rpc();
			await provider.connection.confirmTransaction(sendMessageTx);

			
			const outboundMessage = await mailbox.account.outboundMessage.fetch(outboundMessagePDA);
			expect(outboundMessage[0].body).to.deep.eq(body);
			expect(outboundMessage[0].recipient).to.deep.eq(recipientBz);
			expect(outboundMessage[0].destinationCaller).to.deep.eq(destinationCallerBz);
			expect(outboundMessage[0].nonce).to.deep.eq(config.globalNonce);
			expect(outboundMessage[0].messagePathIdentifier).to.deep.eq(outboundMessagePathBytes);
			// todo: change to a sender program when implemented
			expect(outboundMessage[0].sender).to.deep.eq(Array.from(Uint8Array.from(SystemProgram.programId.toBuffer())));

			// 260 is the size of the gmp message in bytes assuming body is less than 32 bytes
			const potentialFee = feePerByte.muln(260)
			const balanceAfter = await provider.connection.getBalance(payerFeeExempt.publicKey);
			// only tx fee should have been deducted, and assume gmp fee is greater than gas + rent fee
			expect(balanceAfter).to.be.gt(balanceBefore - potentialFee.toNumber());
		})
	})
})