import "dotenv/config";
import * as anchor from "@coral-xyz/anchor";
import { BN, Program } from "@coral-xyz/anchor";
import { Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram } from "@solana/web3.js";
import * as spl from "@solana/spl-token";
import { Consortium } from "../target/types/consortium";
import { Mailbox } from "../target/types/mailbox";
import { sha256 } from "js-sha256";
import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import { ConsortiumUtility } from "./utils/consortium_utilities";
import { ethers, keccak256 } from "ethers";
import { MailboxUtilities, messageV1 } from "./utils/mailbox_utilities";
import { Bridge } from "../target/types/bridge";
import { LombardTokenPool } from "../target/types/lombard_token_pool";
import { MockCcipOfframp } from "../target/types/mock_ccip_offramp";
import { MockCcipRmn } from "../target/types/mock_ccip_rmn";
import { withBlockhashRetry } from "./utils/utils";

chai.use(chaiAsPromised);
const expect = chai.expect;

function toHexString(byteArray: Uint8Array): string {
  return Array.from(byteArray, function (byte: number) {
    return ("0" + (byte & 0xff).toString(16)).slice(-2);
  }).join("");
}

export class BridgePayload {
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

  //   recipientPubKey(): PublicKey {
  //     let address = bs58.encode(Buffer.from(this.destinationAddress, "hex"));
  //     return new PublicKey(address);
  //   }

  amountBigInt(): bigint {
	return BigInt("0x" + this.amount);
  }
}

describe("CCIP Token Pool", () => {
	const provider = anchor.AnchorProvider.env();
	anchor.setProvider(provider);

	const consortium = anchor.workspace.Consortium as Program<Consortium>;
	const mailbox = anchor.workspace.Mailbox as Program<Mailbox>;
	const bridge = anchor.workspace.Bridge as Program<Bridge>;
	const tokenPool = anchor.workspace.LombardTokenPool as Program<LombardTokenPool>
	const mockCcipOfframp = anchor.workspace.MockCcipOfframp as Program<MockCcipOfframp>
	const mockCcipRmn = anchor.workspace.mockCcipRmn as Program<MockCcipRmn>
	// const rmnRemote = anchor.workspace.RmnRemote as Program<RmnRemote>;
	// const router = anchor.workspace.Router as Program<Router>
	
	let nonceForeignChain = 0;
  	let mailboxUtilities: MailboxUtilities;
	let consortiumUtility: ConsortiumUtility;
	let payer: Keypair;
	let payerFeeExempt: Keypair;
	let treasury: Keypair;
	let user: Keypair;
	let admin: Keypair;
	let bridgeConfigPDA: PublicKey;
	let mailboxConfigPDA: PublicKey;
	let tokenPoolConfigPDA: PublicKey;
	let pauser: Keypair;
	let router: Keypair;
	let rmn: Keypair;
  	const mintKeys = Keypair.fromSeed(Uint8Array.from(Array(32).fill(7)));
 	let minter: Keypair;
	let mint: PublicKey;
  	let multisig: PublicKey;
	let tokenPoolStatePDA: PublicKey;
	let tokenPoolSignerPDA: PublicKey;
	let tokenPoolSignerTA: PublicKey;
	let tokenPoolChainConfigPDA: PublicKey;
	let tokenPoolSenderConfigPDA: PublicKey;
	const tokenAuth = PublicKey.findProgramAddressSync(
		[Buffer.from("token_authority")],
		bridge.programId
	)[0] as PublicKey;
	let userTA: PublicKey;
	let payerTA: PublicKey;
	let bridgeLocalTokenConfigPDA: PublicKey;
	let bridgeLocalTokenConfigPDA2: PublicKey;
	let bridgeRemoteTokenConfigPDA: PublicKey;
	let bridgeRemoteTokenConfigPDA2: PublicKey;
	let bridgeRemoteTokenConfigPDA3: PublicKey;
	let bridgeSenderConfigPDA:PublicKey;

	let mockCcipOfframpConfigPDA: PublicKey;
	let cpiSignerPDA: PublicKey;
	let ccipAllowedOfframpPDA: PublicKey;
	let mockCcipRmnConfigPDA: PublicKey;
	let rmnCursesPDA: PublicKey;

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
	minter = Keypair.generate();
	router = Keypair.generate();
	rmn = Keypair.generate();
	const t = Keypair.generate();

	const lchainId = Buffer.from("02296998a6f8e2a784db5d9f95e18fc23f70441a1039446801089879b08c7ef0", "hex");
	const foreignLchainId = Buffer.from(sha256("foreign-lchain-id"), "hex");
	const accountRolesPauserPDA = PublicKey.findProgramAddressSync([Buffer.from("account_roles"), pauser.publicKey.toBuffer()], mailbox.programId)[0];
	const lchainIdBytes = Array.from(Uint8Array.from(lchainId));
	const foreignLchainIdBytes = Array.from(Uint8Array.from(foreignLchainId));
	const foreignMailboxAddress = Buffer.from(sha256("foreign-mailbox-address"), "hex");
	const foreignMailboxAddressBytes = Array.from(Uint8Array.from(foreignMailboxAddress));
	const foreignBridgeAddress = Buffer.from(sha256("foreign-bridge-address"), "hex");
	const foreignBridgeAddressBytes = Array.from(Uint8Array.from(foreignBridgeAddress));
	const foreignToken = Buffer.from(sha256("foreign-token"), "hex");
	const foreignTokenBytes = Array.from(Uint8Array.from(foreignToken));
	const inboundMessagePath = Buffer.from(keccak256(Buffer.concat([foreignMailboxAddress, foreignLchainId, lchainId])).slice(2), "hex");
	const [inboundMessagePathPDA] = PublicKey.findProgramAddressSync([Buffer.from("inbound_message_path"), foreignLchainId], mailbox.programId);
	const outboundMessagePath = Buffer.from(
		keccak256(Buffer.concat([mailbox.programId.toBuffer(), lchainId, foreignLchainId])).slice(2),
		"hex"
	);
	const [outboundMessagePathPDA] = PublicKey.findProgramAddressSync(
		[Buffer.from("outbound_message_path"), foreignLchainId],
		mailbox.programId
	);
	const outboundMessagePathBytes = Array.from(Uint8Array.from(outboundMessagePath));
	const systemProgramSenderConfigPDA = PublicKey.findProgramAddressSync([Buffer.from("sender_config"), SystemProgram.programId.toBuffer()], mailbox.programId)[0];
	const bridgeRemoteBridgeConfigPDA = PublicKey.findProgramAddressSync(
		[Buffer.from("remote_bridge_config"), foreignLchainId],
		bridge.programId
	)[0];

	const originalSender = Buffer.from(sha256("some-original-sender"), "hex");
	const originalSenderBytes = Array.from(Uint8Array.from(originalSender));
	const foreignPoolAddress = Buffer.from(sha256("some-source-pool"), "hex");
	const foreignPoolAddressBytes = Array.from(Uint8Array.from(foreignPoolAddress));
	const receiver = user.publicKey;
	const amount = 2000;
	// const amountL?Bytes = Array.from(Uint8Array.from(Buffer.from((amount.toString(16) + "0000000000000000000000000000000000000000000000000000000000000000").slice(0, 64), "hex")))
	const amountLeBytes = Array.from(Uint8Array.from(new BN(amount).toBuffer("le", 32)));
	const foreignChainSelector = new BN('1234567');
	const foreignPoolData = Buffer.from(sha256("some-source-pool-data"), "hex");
	const foreignPoolDataBytes = Array.from(Uint8Array.from(foreignPoolData));
	const tokenPoolProgramData = PublicKey.findProgramAddressSync(
		[tokenPool.programId.toBuffer()],
		new PublicKey("BPFLoaderUpgradeab1e11111111111111111111111")
	)[0];
	const mockCcipOfframpProgramData = PublicKey.findProgramAddressSync(
		[mockCcipOfframp.programId.toBuffer()],
		new PublicKey("BPFLoaderUpgradeab1e11111111111111111111111")
	)[0];
	const mockCcipRmnProgramData = PublicKey.findProgramAddressSync(
		[mockCcipRmn.programId.toBuffer()],
		new PublicKey("BPFLoaderUpgradeab1e11111111111111111111111")
	)[0];
	const foreignCaller = Buffer.from(sha256("foreign-token"), "hex");
	const foreignCallerBytes = Array.from(Uint8Array.from(foreignCaller));
	
	const defaultMaxPayloadSize = 1000;
	// tests rely on the fact that minimum fee for a legitimate gmp message e.g. 260 * feePerByte
	// is greater than the fee payed for gas and rent of the instruction under test
	// this is just for ease of assertions to avoid to exactly calculate the instruction fee
    const feePerByte = new BN(1000000);
	const senderBytes = Uint8Array.from(Buffer.from(sha256("some-sender"), "hex"));

	before("fund wallets, initialize consortium utility and deploy mailbox", async () => {
		await fundWallet(payer, 25 * LAMPORTS_PER_SOL);
		await fundWallet(payerFeeExempt, 25 * LAMPORTS_PER_SOL);
		await fundWallet(user, 25 * LAMPORTS_PER_SOL);
		await fundWallet(admin, 25 * LAMPORTS_PER_SOL);
		await fundWallet(minter, 25 * LAMPORTS_PER_SOL);

		await fundWallet(t, 25 * LAMPORTS_PER_SOL);

		multisig = await spl.createMultisig(provider.connection, admin, [tokenAuth, minter.publicKey], 1);
		mint = await spl.createMint(provider.connection, admin, multisig, admin.publicKey, 8, mintKeys);

		[bridgeConfigPDA] = PublicKey.findProgramAddressSync([Buffer.from("bridge_config")], bridge.programId);
		[mailboxConfigPDA] = PublicKey.findProgramAddressSync([Buffer.from("mailbox_config")], mailbox.programId);
		[tokenPoolConfigPDA] = PublicKey.findProgramAddressSync([Buffer.from("config")], tokenPool.programId);
		[tokenPoolStatePDA] = PublicKey.findProgramAddressSync([Buffer.from("ccip_tokenpool_config"), mint.toBytes()], tokenPool.programId);
		[tokenPoolSignerPDA] = PublicKey.findProgramAddressSync([Buffer.from("ccip_tokenpool_signer"), mint.toBytes()], tokenPool.programId);
		tokenPoolSignerTA = await spl.createAssociatedTokenAccount(provider.connection, admin, mint, tokenPoolSignerPDA, undefined, spl.TOKEN_PROGRAM_ID, spl.ASSOCIATED_TOKEN_PROGRAM_ID, true);
		[tokenPoolChainConfigPDA] = PublicKey.findProgramAddressSync([Buffer.from("ccip_tokenpool_chainconfig"), foreignChainSelector.toBuffer("le", 8), mint.toBytes()], tokenPool.programId);
		tokenPoolSenderConfigPDA = PublicKey.findProgramAddressSync(
		[Buffer.from("sender_config"), tokenPoolSignerPDA.toBuffer()],
		bridge.programId
		)[0];
		bridgeSenderConfigPDA = PublicKey.findProgramAddressSync(
		[Buffer.from("sender_config"), bridge.programId.toBuffer()],
		mailbox.programId
		)[0];

		[mockCcipOfframpConfigPDA] = PublicKey.findProgramAddressSync([Buffer.from("ccip_mock_config")], mockCcipOfframp.programId);
		[rmnCursesPDA] = PublicKey.findProgramAddressSync([Buffer.from("curses")], mockCcipRmn.programId);
		[mockCcipRmnConfigPDA] = PublicKey.findProgramAddressSync([Buffer.from("config")], mockCcipRmn.programId);
		[cpiSignerPDA] = PublicKey.findProgramAddressSync([Buffer.from("external_token_pools_signer"), tokenPool.programId.toBytes()], mockCcipOfframp.programId);
		[ccipAllowedOfframpPDA] = PublicKey.findProgramAddressSync([Buffer.from("allowed_offramp"), foreignChainSelector.toBuffer("le", 8), mockCcipOfframp.programId.toBytes()], mockCcipOfframp.programId);

		bridgeLocalTokenConfigPDA = PublicKey.findProgramAddressSync(
			[Buffer.from("local_token_config"), mint.toBytes()],
			bridge.programId
		)[0];
		bridgeRemoteTokenConfigPDA = PublicKey.findProgramAddressSync(
			[Buffer.from("remote_token_config"), mint.toBytes(), foreignLchainId],
			bridge.programId
		)[0];

		// await fundWallet(tokenPoolSignerPDA, 25 * LAMPORTS_PER_SOL);
		await fundWallet(cpiSignerPDA, 25 * LAMPORTS_PER_SOL);

		consortiumUtility = new ConsortiumUtility(consortium);
		consortiumUtility.generateAndAddKeypairs(3);
		await consortiumUtility.initializeConsortiumProgram(admin);

		mailboxUtilities = new MailboxUtilities(consortiumUtility, lchainId, admin, treasury.publicKey);

		await withBlockhashRetry(() =>
		  mailbox.methods
			.initialize(admin.publicKey, consortium.programId, treasury.publicKey, defaultMaxPayloadSize, feePerByte)
			.accounts({
				deployer: provider.wallet.publicKey
			})
			.signers([Keypair.fromSecretKey(provider.wallet.payer.secretKey)])
			.rpc({ commitment: "confirmed" })
		);
		await withBlockhashRetry(() =>
		  bridge.methods
			.initialize(admin.publicKey, mailbox.programId)
			.accounts({
				deployer: provider.wallet.publicKey,
				mint
			})
			.signers([Keypair.fromSecretKey(provider.wallet.payer.secretKey)])
			.rpc({ commitment: "confirmed" })
		);
		
		userTA = await spl.createAssociatedTokenAccount(provider.connection, user, mint, user.publicKey);
		payerTA = await spl.createAssociatedTokenAccount(provider.connection, payer, mint, payer.publicKey);
	});

	describe("Initialize token pool", function () {
		it("initialize: initGlobalConfig fails when payer is not deployer", async () => {
			await expect(
				  withBlockhashRetry(() =>
				    tokenPool.methods
				.initGlobalConfig()
				.accountsPartial({
					authority: payer.publicKey,
					programData: tokenPoolProgramData,
					config: tokenPoolConfigPDA,
				})
				.signers([payer])
				.rpc({ commitment: "processed" })
				  )
				).to.be.rejectedWith("Unauthorized.");
		});

		it("initialize: fails when payer is not deployer", async () => {
			await withBlockhashRetry(() =>
			  tokenPool.methods
				.initGlobalConfig()
				.accountsPartial({
					programData: tokenPoolProgramData,
					config: tokenPoolConfigPDA,
					authority: provider.wallet.publicKey,
				})
				.signers([Keypair.fromSecretKey(provider.wallet.payer.secretKey)])
				.rpc({ commitment: "confirmed" })
			);
			await expect(
				  withBlockhashRetry(() =>
				    tokenPool.methods
				.initialize(mockCcipOfframp.programId, mockCcipRmn.programId, bridge.programId)
				.accountsPartial({
					authority: payer.publicKey,
					state: tokenPoolStatePDA,
					mint: mint,
					programData: tokenPoolProgramData,
					config: tokenPoolConfigPDA,
				})
				.signers([payer])
				.rpc({ commitment: "confirmed" })
				  )
				).to.be.rejectedWith("Unauthorized.");
		});

		it("initialize: successful", async () => {
			// This test presumes that `initGlobalConfig` has been called successfully
			await withBlockhashRetry(() =>
			  tokenPool.methods
				.initialize(mockCcipOfframp.programId, mockCcipRmn.programId, bridge.programId)
				.accountsPartial({
					state: tokenPoolStatePDA,
					mint: mint,
					programData: tokenPoolProgramData,
					config: tokenPoolConfigPDA,
				})
				.signers([Keypair.fromSecretKey(provider.wallet.payer.secretKey)])
				.rpc({ commitment: "confirmed" })
			);
			// const cfg = await bridge.account.config.fetch(bridgeConfigPDA);
			// expect(cfg.admin.toBase58()).to.be.eq(admin.publicKey.toBase58());
					// todo: check all fields
		});

		it("initialize remote chain config: successful", async () => {
			// This test presumes that `initGlobalConfig` has been called successfully
			await withBlockhashRetry(() =>
			  tokenPool.methods
				.initChainRemoteConfig(foreignChainSelector, mint, {
					poolAddresses: [],
					tokenAddress: {address: foreignToken},
					decimals: 8,
				}, foreignLchainIdBytes, foreignPoolAddressBytes)
				.accountsPartial({
					state: tokenPoolStatePDA,
					chainConfig: tokenPoolChainConfigPDA,
					authority: provider.wallet.publicKey,
				})
				.signers([Keypair.fromSecretKey(provider.wallet.payer.secretKey)])
				.rpc({ commitment: "confirmed" })
			);
			// const cfg = await bridge.account.config.fetch(bridgeConfigPDA);
			// expect(cfg.admin.toBase58()).to.be.eq(admin.publicKey.toBase58());
					// todo: check all fields
		});

		it("append remote pool address: successful", async () => {
			// This test presumes that `appendRemotePoolAddresses` has been called successfully
			await withBlockhashRetry(() =>
			  tokenPool.methods
				.appendRemotePoolAddresses(foreignChainSelector, mint, [{address: foreignPoolAddress}])
				.accountsPartial({
					state: tokenPoolStatePDA,
					chainConfig: tokenPoolChainConfigPDA,
					authority: provider.wallet.publicKey,
				})
				.signers([Keypair.fromSecretKey(provider.wallet.payer.secretKey)])
				.rpc({ commitment: "confirmed" })
			);
			// const cfg = await bridge.account.config.fetch(bridgeConfigPDA);
			// expect(cfg.admin.toBase58()).to.be.eq(admin.publicKey.toBase58());
					// todo: check all fields
		});
	});

	describe("incoming CCIP bridge operation", () => {

		// enable inbound message path before the test
		before(async () => {
			await withBlockhashRetry(() =>
			  mailbox.methods
				.enableInboundMessagePath(foreignLchainIdBytes, foreignMailboxAddressBytes)
				.accounts({
				admin: admin.publicKey
				})
				.signers([admin])
				.rpc({ commitment: "confirmed" })
			);
			await withBlockhashRetry(() =>
			  bridge.methods
				.setRemoteBridgeConfig(foreignLchainIdBytes, foreignBridgeAddressBytes)
				.accounts({
				admin: admin.publicKey
				})
				.signers([admin])
				.rpc({ commitment: "confirmed" })
			);
			await withBlockhashRetry(() =>
			  bridge.methods
				.setLocalTokenConfig(mint)
				.accounts({
				admin: admin.publicKey
				})
				.signers([admin])
				.rpc({ commitment: "confirmed" })
			);
			await withBlockhashRetry(() =>
			  bridge.methods
				.setRemoteTokenConfig(mint, foreignLchainIdBytes, foreignTokenBytes, 3)
				.accounts({
				admin: admin.publicKey
				})
				.signers([admin])
				.rpc({ commitment: "confirmed" })
			);
			await withBlockhashRetry(() =>
			  mockCcipOfframp.methods
				.addOfframp(foreignChainSelector, mockCcipOfframp.programId)
				.accounts({
					authority:admin.publicKey,
				})
				.signers([admin])
				.rpc({ commitment: "confirmed" })
			);
			await withBlockhashRetry(() =>
			  mockCcipOfframp.methods
				.initialize(tokenPool.programId)
				.accountsPartial({
					deployer: provider.wallet.publicKey,
					programData: mockCcipOfframpProgramData,
					config: mockCcipOfframpConfigPDA,
				})
				.signers([Keypair.fromSecretKey(provider.wallet.payer.secretKey)])
				.rpc({ commitment: "confirmed" })
			);
			await withBlockhashRetry(() =>
			  mockCcipRmn.methods
				.initialize()
				.accountsPartial({
					deployer: provider.wallet.publicKey,
					programData: mockCcipRmnProgramData,
					config: mockCcipRmnConfigPDA,
					curses: rmnCursesPDA,
				})
				.signers([Keypair.fromSecretKey(provider.wallet.payer.secretKey)])
				.rpc({ commitment: "confirmed" })
			);
		})

		after(async () => {
		})

		it("receive tokens via CCIP bridge", async () => {
			const bridgePayload = new BridgePayload(mint.toBytes(), senderBytes, userTA.toBytes(), amount);
			const message = messageV1(
				inboundMessagePath,
				nonceForeignChain++,
				foreignBridgeAddress,
				bridge.programId.toBuffer(),
				tokenPoolSignerPDA.toBuffer(),
				bridgePayload.bytes()
			);

			const { payloadHash, payloadHashBytes } = await mailboxUtilities.deliverMessage(
				foreignMailboxAddress,
				foreignLchainId,
				payer,
				message
			);

			const messageInfoPDA = PublicKey.findProgramAddressSync(
				[Buffer.from("message"), payloadHash],
				mailbox.programId
			)[0];
			const messageHandledPDA = PublicKey.findProgramAddressSync(
				[Buffer.from("message_handled"), payloadHash],
				bridge.programId
			)[0];

			const balanceBefore = await provider.connection.getBalance(payerFeeExempt.publicKey);

			const nonce = 1;
			const nonceBuf = Buffer.from([1,0]);

			const mintArg = {
				originalSender: originalSender,
				remoteChainSelector: foreignChainSelector,
				receiver: receiver,
				localToken: mint,
				sourcePoolAddress: foreignPoolAddress,
				sourcePoolData: payloadHash,
				offchainTokenData: Buffer.from([]),
				amount: amountLeBytes,
			}
			const offRampDataPDA = PublicKey.findProgramAddressSync([Buffer.from("offramp_data"), nonceBuf], mockCcipOfframp.programId)[0];
			await withBlockhashRetry(() =>
			  mockCcipOfframp.methods
				.initOfframp(nonce, mintArg)
				.accountsPartial({
					payer: payer.publicKey,
					offrampData: offRampDataPDA,
					systemProgram: SystemProgram.programId,
				})
				.signers([payer])
				.rpc({ commitment: "confirmed" })
			);
			const tokenBalanceBefore = await spl.getAccount(provider.connection, userTA);
			await withBlockhashRetry(() =>
			  mockCcipOfframp.methods
				.executeOfframp(nonce)
				.accountsPartial({
					authority: payer.publicKey,
					tokenPool: tokenPool.programId,
					cpiSigner: cpiSignerPDA,
					offrampData: offRampDataPDA,
					systemProgram: SystemProgram.programId,
				})
				.remainingAccounts([
					// {
					// 	pubkey: payer.publicKey,
					// 	isWritable: true,
					// 	isSigner: true
					// },
					{ // offramp program
						pubkey: mockCcipOfframp.programId,
						isWritable: false,
						isSigner: false
					},
					{ // allowedOfframp
						pubkey: ccipAllowedOfframpPDA,
						isWritable: false,
						isSigner: false
					},
					{ // state
						pubkey: tokenPoolStatePDA,
						isWritable: false,
						isSigner: false
					},
					{ // tokenProgram
						pubkey: spl.TOKEN_PROGRAM_ID,
						isWritable: false,
						isSigner: false
					},
					{ // mint
						pubkey: mint,
						isWritable: true,
						isSigner: false
					},
					{ // poolSigner
						pubkey: tokenPoolSignerPDA,
						isWritable: true,
						isSigner: false
					},
					{ // chainConfig
						pubkey: tokenPoolChainConfigPDA,
						isWritable: true,
						isSigner: false
					},
					{ // rmnRemote
						pubkey: mockCcipRmn.programId,
						isWritable: false,
						isSigner: false
					},
					{ // rmnRemoteCurses
						pubkey: rmnCursesPDA,
						isWritable: false,
						isSigner: false
					},
					{ // rmnRemoteConfig
						pubkey: mockCcipRmnConfigPDA,
						isWritable: false,
						isSigner: false
					},
					{ // bridge
						pubkey: bridge.programId,
						isWritable: false,
						isSigner: false
					},
					{ // mailbox
						pubkey: mailbox.programId,
						isWritable: false,
						isSigner: false
					},
					{ // messageInfo
						pubkey: messageInfoPDA,
						isWritable: true,
						isSigner: false
					},
					{ // messageHandled
						pubkey: messageHandledPDA,
						isWritable: true,
						isSigner: false
					},
					{ // mailboxConfig
						pubkey: mailboxConfigPDA,
						isWritable: true,
						isSigner: false
					},
					{ // bridgeConfig
						pubkey: bridgeConfigPDA,
						isWritable: false,
						isSigner: false
					},
					{ // receiverTokenAccaunt
						pubkey: userTA,
						isWritable: true,
						isSigner: false
					},
					{ // mintAuthority
						pubkey: multisig,
						isWritable: false,
						isSigner: false
					},
					{ // tokenAuthority
						pubkey: tokenAuth,
						isWritable: false,
						isSigner: false
					},
					{ // remoteBridgeConfig
						pubkey: bridgeRemoteBridgeConfigPDA,
						isWritable: false,
						isSigner: false
					},
					{ // localTokenConfig
						pubkey: bridgeLocalTokenConfigPDA,
						isWritable: false,
						isSigner: false
					},
					{ // remoteTokenConfig
						pubkey: bridgeRemoteTokenConfigPDA,
						isWritable: true,
						isSigner: false
					},
					{ // inboundMessagePath
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
			);

			const tokenBalanceAfter = await spl.getAccount(provider.connection, userTA);
    		expect(tokenBalanceAfter.amount).to.be.equal(tokenBalanceBefore.amount + BigInt(amount));
		})
	})

	describe("outgoing message", () => {

		const customMaxPayloadSize = defaultMaxPayloadSize + 100;
    	const events = [];
		let listener: number;

		// enable outbound message path before the test
		before(async () => {
			await withBlockhashRetry(() =>
			  mailbox.methods
				.enableOutboundMessagePath(foreignLchainIdBytes)
				.accounts({
					admin: admin.publicKey
				})
				.signers([admin])
				.rpc({ commitment: "confirmed" })
			);
			await withBlockhashRetry(() =>
			  mailbox.methods
				.setSenderConfig(bridge.programId, customMaxPayloadSize, true)
				.accounts({
					admin: admin.publicKey
				})
				.signers([admin])
				.rpc({ commitment: "confirmed" })
			);
			await withBlockhashRetry(() =>
			  bridge.methods
				.setSenderConfig(tokenPoolSignerPDA, new BN(10000), true) // No bridge fee for the token pool
				.accounts({
					admin: admin.publicKey
				})
				.signers([admin])
				.rpc({ commitment: "confirmed" })
			);

			await spl.mintTo(provider.connection, minter, mint, payerTA, multisig, 100000000, [minter]);

			//Subscribe for events
			listener = mockCcipOfframp.addEventListener("mockCcipOnrampCompleted", (event, slot, signature) => {
				events.push(event);
			});
		});
		
		// disable outbound message path after the test
		after(async () => {
			mockCcipOfframp.removeEventListener(listener);
		})

		it("send tokens to another chain", async () => {
			let config = await mailbox.account.config.fetch(mailboxConfigPDA);
			let recipient = Buffer.from(sha256("recipient"), "hex");
			let recipientBz = Array.from(Uint8Array.from(recipient));
			let senderBz = Array.from(Uint8Array.from(user.publicKey.toBuffer()));
			const outboundMessagePDA = PublicKey.findProgramAddressSync(
				[Buffer.from("outbound_message"), config.globalNonce.toArrayLike(Buffer, "be", 8)],
				mailbox.programId
			)[0];

			const tokenBalanceBefore = await spl.getAccount(provider.connection, payerTA);

			// const balanceBefore = await provider.connection.getBalance(payerFeeExempt.publicKey);
			const amountToSend = 1000;

			await withBlockhashRetry(() =>
			  mockCcipOfframp.methods
				.executeOnramp(recipient, foreignChainSelector, user.publicKey, new BN(amountToSend), new BN(nonceForeignChain++))
				.accountsPartial({
					sender: payer.publicKey,
					senderTokenAccount: payerTA,
					tokenProgram: spl.TOKEN_PROGRAM_ID,
					mint: mint,
					tokenPool: tokenPool.programId,
					tokenPoolTokenAccount: tokenPoolSignerTA,
					cpiSigner: cpiSignerPDA,
					systemProgram: SystemProgram.programId,
				})
				.remainingAccounts([
					// {
					// 	pubkey: payer.publicKey,
					// 	isWritable: true,
					// 	isSigner: true
					// },
					{ // state
						pubkey: tokenPoolStatePDA,
						isWritable: false,
						isSigner: false
					},
					{ // poolSigner
						pubkey: tokenPoolSignerPDA,
						isWritable: true,
						isSigner: false
					},
					{ // poolSigner token account
						pubkey: tokenPoolSignerTA,
						isWritable: true,
						isSigner: false
					},
					{ // rmnRemote
						pubkey: mockCcipRmn.programId,
						isWritable: false,
						isSigner: false
					},
					{ // rmnRemoteCurses
						pubkey: rmnCursesPDA,
						isWritable: false,
						isSigner: false
					},
					{ // rmnRemoteConfig
						pubkey: mockCcipRmnConfigPDA,
						isWritable: false,
						isSigner: false
					},
					{ // chainConfig
						pubkey: tokenPoolChainConfigPDA,
						isWritable: true,
						isSigner: false
					},
					{ // bridge
						pubkey: bridge.programId,
						isWritable: false,
						isSigner: false
					},
					{ // mailbox
						pubkey: mailbox.programId,
						isWritable: false,
						isSigner: false
					},
					{ // mailboxConfig
						pubkey: mailboxConfigPDA,
						isWritable: true,
						isSigner: false
					},
					{ // bridgeConfig
						pubkey: bridgeConfigPDA,
						isWritable: false,
						isSigner: false
					},
					{ // bridgeSenderConfig
						pubkey: tokenPoolSenderConfigPDA,
						isWritable: false,
						isSigner: false
					},
					{ // outboundMessagePath
						pubkey: outboundMessagePathPDA,
						isWritable: false,
						isSigner: false
					},
					{ // outboundMessage
						pubkey: outboundMessagePDA,
						isWritable: true,
						isSigner: false
					},
					{ // mailboxSenderConfig
						pubkey: bridgeSenderConfigPDA,
						isWritable: true,
						isSigner: false
					},
					{ // remoteBridgeConfig
						pubkey: bridgeRemoteBridgeConfigPDA,
						isWritable: false,
						isSigner: false
					},
					{ // localTokenConfig
						pubkey: bridgeLocalTokenConfigPDA,
						isWritable: false,
						isSigner: false
					},
					{ // remoteTokenConfig
						pubkey: bridgeRemoteTokenConfigPDA,
						isWritable: true,
						isSigner: false
					},
					{ // Treasury
						pubkey: tokenPool.programId,
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
			);

			const expectedBody = new BridgePayload(foreignToken, user.publicKey.toBytes(), recipient, amountToSend);
			const expecedGmpMessage = messageV1(
				Buffer.from(outboundMessagePathBytes),
				config.globalNonce.toNumber(),
				bridge.programId.toBuffer(),
				Buffer.from(foreignBridgeAddressBytes),
				foreignPoolAddress,
				expectedBody.bytes(),
			);

			const outboundMessageAccount = await provider.connection.getAccountInfo(outboundMessagePDA);
			expect(outboundMessageAccount.data).to.deep.eq(expecedGmpMessage)

			// 260 is the size of the gmp message in bytes assuming body is less than 32 bytes
			const potentialFee = feePerByte.muln(260);
			const balanceAfter = await provider.connection.getBalance(payerFeeExempt.publicKey);
			// only tx fee should have been deducted, and assume gmp fee is greater than gas + rent fee
			// expect(balanceAfter).to.be.gt(balanceBefore - potentialFee.toNumber());
			const tokenBalanceAfter = await spl.getAccount(provider.connection, payerTA);
			expect(tokenBalanceAfter.amount).to.be.equal(tokenBalanceBefore.amount - BigInt(amountToSend));

			const abiCoder = ethers.AbiCoder.defaultAbiCoder();

			const expectedHash = sha256(outboundMessageAccount.data);
			const encodedExpectedHash = abiCoder.encode(['bytes32'] , ['0x'+expectedHash]);
			const expectedHashBuffer = Buffer.from(encodedExpectedHash.substring(2), "hex");

			// Check event
			expect(events).to.be.not.empty;
			expect(Buffer.from(events[0].bridgeData)).to.be.deep.eq(expectedHashBuffer);
		});
	})
})
