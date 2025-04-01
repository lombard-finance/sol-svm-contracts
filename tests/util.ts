import { expect } from "chai";
import * as anchor from "@coral-xyz/anchor";
import { keccak_256 } from "@noble/hashes/sha3";
import { ConfirmOptions, Keypair, PublicKey } from "@solana/web3.js";
import { Bascule } from "../target/types/bascule";
import { findInitialProgramAddress } from "../app/util";

export const EPaused = "EPaused";
export const ENotAdmin = "ENotAdmin";
export const ENotPauser = "ENotPauser";
export const ENotDeployer = "ENotDeployer";
export const ENotReporter = "ENotReporter";
export const ENotValidator = "ENotValidator";
export const EMaxValidators = "EMaxValidators";
export const ENotPendingAdmin = "ENotPendingAdmin";
export const EAlreadyWithdrawn = "EAlreadyWithdrawn";
export const EWithdrawalFailedValidation = "EWithdrawalFailedValidation";

export const rpcOpts: ConfirmOptions = { commitment: "confirmed" };

export interface TestAccounts {
  deployer: anchor.Wallet;
  admin: anchor.Wallet;
  pauser: anchor.Wallet;
  reporter: anchor.Wallet;
  validator: anchor.Wallet;
  other: anchor.Wallet;
}

/** Deconstructed deposit id */
export class DepositId {
  readonly depositId: number[];

  constructor(
    /** Solana recipient wallet */
    readonly recipient: PublicKey,
    /** Transaction amount in SAT (64-bit unsigned int) */
    readonly amount: anchor.BN,
    /** Bitcoin transaction id (32 bytes) */
    readonly txId: Uint8Array,
    /** Bitcoin transaction output index (32-bit unsigned int) */
    readonly txVout: number
  ) {
    // CODESYNC(solana-deposit-id)
    // fixed-bytes32(0x00) || 0x03, 0x53, 0x4f, 0x4c || recipient || amount (BE) || txId || txVout (BE)
    const bytes: number[] = [];
    bytes.push(...new Uint8Array(32));
    bytes.push(...[0x03, 0x53, 0x4f, 0x4c]);
    bytes.push(...recipient.toBytes());
    bytes.push(...amount.toArray("be", 8)); // u64 value
    bytes.push(...txId);
    bytes.push(...new anchor.BN(txVout).toArray("be", 4)); // u32 value
    this.depositId = [...keccak_256(new Uint8Array(bytes))];
  }

  /** Creates a {@link DepositId} for a given amount and everything else random */
  static randomForAmount(amount: number | anchor.BN): DepositId {
    const kp = Keypair.generate();
    const txId = Keypair.generate().publicKey.toBytes().slice(0, 32);
    expect(txId.length).to.eq(32);
    return new DepositId(kp.publicKey, new anchor.BN(amount), txId, 0);
  }
}

export function delayMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function assertError(p: Promise<unknown>, code?: string): Promise<Error> {
  const err = await p.then((_) => undefined).catch((e) => e);
  expect(err).to.exist;
  console.log("Got error, as expected", err.toString());
  if (code) {
    expect(err).to.be.instanceOf(anchor.AnchorError, err);
    expect(err.error.errorCode.code).to.eq(code, err);
  }
  return err;
}

export class TestSetup {
  readonly acc: TestAccounts;
  readonly basculePda: PublicKey;

  constructor(readonly program: anchor.Program<Bascule>, acc: TestAccounts | anchor.Wallet) {
    this.acc =
      acc instanceof anchor.Wallet
        ? {
            deployer: acc,
            admin: new anchor.Wallet(Keypair.generate()),
            pauser: new anchor.Wallet(Keypair.generate()),
            reporter: new anchor.Wallet(Keypair.generate()),
            validator: new anchor.Wallet(Keypair.generate()),
            other: new anchor.Wallet(Keypair.generate()),
          }
        : acc;
    [this.basculePda] = PublicKey.findProgramAddressSync([Buffer.from("bascule")], program.programId);
  }

  get provider() {
    return this.program.provider;
  }

  /** Funds all designated accounts in {@link TestAccounts} */
  async fundAccounts() {
    const wallets = [
      this.acc.deployer,
      this.acc.admin,
      this.acc.pauser,
      this.acc.reporter,
      this.acc.validator,
      this.acc.other,
    ];
    console.log(`Funding ${wallets.length} wallets`);
    for (const w of wallets) {
      const tx = await this.provider.connection.requestAirdrop(w.publicKey, 10_000_000_000);
      await this.provider.connection.confirmTransaction(tx);
    }
  }

  /** Initializes the program (by calling the 'initialize' method) */
  async init(payer?: anchor.Wallet) {
    payer ??= this.acc.deployer;
    await this.program.methods
      .initialize()
      .accounts({ payer: payer.publicKey, programData: findInitialProgramAddress(this.program.programId) })
      .signers([payer.payer])
      .rpc(rpcOpts);

    // grant permissions to accounts
    await this.grantPermissions();
  }

  /**
   * Grant the 'admin' permissions to `admin`, performing the action with wallet `w` (defaulting to `this.acc.deployer`).
   */
  async grantAdmin(admin: PublicKey, w?: anchor.Wallet) {
    console.log("grant admin to", admin.toBase58());
    w ??= this.acc.deployer;
    await this.program.methods.grantAdmin(admin).accounts({ deployer: w.publicKey }).signers([w.payer]).rpc(rpcOpts);
  }

  /**
   * Initiate the admin transfer process
   */
  async transferAdminInit(newAdmin: PublicKey, currentAdmin: anchor.Wallet) {
    console.log("transferring admin to", newAdmin.toBase58());
    await this.program.methods
      .transferAdminInit(newAdmin)
      .accounts({ admin: currentAdmin.publicKey })
      .signers([currentAdmin.payer])
      .rpc(rpcOpts);
  }

  /**
   * Accept a previously initiated admin transfer.
   */
  async transferAdminAccept(pendingAdmin: anchor.Wallet) {
    console.log("accepting admin transfer", pendingAdmin.publicKey.toBase58());
    await this.program.methods
      .transferAdminAccept()
      .accounts({ pendingAdmin: pendingAdmin.publicKey })
      .signers([pendingAdmin.payer])
      .rpc(rpcOpts);
  }

  /**
   * Grant the 'pauser' permissions to `pauser`, performing the action with wallet `w` (defaulting to `this.acc.admin`).
   */
  async grantPauser(pauser: PublicKey, w?: anchor.Wallet) {
    console.log("grant pauser to", pauser.toBase58());
    w ??= this.acc.admin;
    await this.program.methods.grantPauser(pauser).accounts({ admin: w.publicKey }).signers([w.payer]).rpc(rpcOpts);
  }

  /**
   * Grant the 'reporter' permissions to `reporter`, performing the action with wallet `w` (defaulting to `this.acc.admin`).
   */
  async grantReporter(reporter: PublicKey, w?: anchor.Wallet) {
    console.log("grant reporter to", reporter.toBase58());
    w ??= this.acc.admin;
    await this.program.methods.grantReporter(reporter).accounts({ admin: w.publicKey }).signers([w.payer]).rpc(rpcOpts);
  }

  /**
   * Grant the 'validator' permissions to `validator`, performing the action with wallet `w` (defaulting to `this.acc.admin`).
   */
  async grantValidator(validator: PublicKey, w?: anchor.Wallet) {
    console.log("grant validator to", validator.toBase58());
    w ??= this.acc.admin;
    await this.program.methods
      .addWithdrawalValidator(validator)
      .accounts({ admin: w.publicKey })
      .signers([w.payer])
      .rpc(rpcOpts);
  }

  /**
   * Grant the 'pauser', 'reporter', and 'validator'
   * permissions to the designated test wallets, and
   * grant 'admin' to the admin wallet if different
   * deployer.
   */
  async grantPermissions() {
    if (this.acc.admin !== this.acc.deployer) {
      await this.grantAdmin(this.acc.admin.publicKey);
    }
    await this.grantPauser(this.acc.pauser.publicKey);
    await this.grantReporter(this.acc.reporter.publicKey);
    await this.grantValidator(this.acc.validator.publicKey);
  }

  /**
   * Update validate threshold using the designated 'admin' account.
   */
  async setThreshold(amount: number | anchor.BN, w?: anchor.Wallet) {
    w ??= this.acc.admin;
    return await this.program.methods
      .updateValidateThreshold(new anchor.BN(amount))
      .accounts({ admin: w.publicKey })
      .signers([w.payer])
      .rpc(rpcOpts);
  }

  /**
   * Pause the program using the designated 'admin' account
   */
  async pause(w?: anchor.Wallet) {
    w ??= this.acc.pauser;
    return await this.program.methods.pause().accounts({ pauser: w.publicKey }).signers([w.payer]).rpc(rpcOpts);
  }

  /**
   * Unpause the program using the designated 'admin' account
   */
  async unpause(w?: anchor.Wallet) {
    w ??= this.acc.pauser;
    return await this.program.methods.unpause().accounts({ pauser: w.publicKey }).signers([w.payer]).rpc(rpcOpts);
  }

  /**
   * Report deposit using the using the designated 'reporter' account.
   */
  async reportDeposit(depositId: number[] | DepositId, w?: anchor.Wallet) {
    w ??= this.acc.reporter;
    return await this.program.methods
      .reportDeposit(depositId instanceof DepositId ? depositId.depositId : depositId)
      .accounts({ reporter: w.publicKey })
      .signers([w.payer])
      .rpc(rpcOpts);
  }

  /**
   * Validate deposit withdrawal (by default the using the designated 'validator' account as both 'validator' and 'payer').
   */
  async validateWithdrawal(d: DepositId, validator?: anchor.Wallet, payer?: anchor.Wallet) {
    validator ??= this.acc.validator;
    payer ??= validator;
    return await this.program.methods
      .validateWithdrawal(d.depositId, d.recipient, d.amount, [...d.txId], d.txVout)
      .accounts({ validator: validator.publicKey, payer: payer.publicKey })
      .signers([validator.payer, payer.payer])
      .rpc(rpcOpts);
  }

  /**
   * Fetch the current 'BasculeData' account
   */
  async fetchData() {
    return await this.program.account.basculeData.fetch(this.basculePda, rpcOpts.commitment);
  }

  /**
   * Fetch the current 'BasculeDeposit' account for a given deposit id
   */
  async fetchDeposit(d: DepositId) {
    const [depositPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("deposit"), Buffer.from(d.depositId)],
      this.program.programId
    );
    return await this.program.account.deposit.fetch(depositPda, rpcOpts.commitment);
  }

  async expectReported(d: DepositId) {
    const acc = await this.fetchDeposit(d);
    expect(acc.state.reported).to.exist;
    expect(acc.state.unreported).to.be.undefined;
    expect(acc.state.withdrawn).to.be.undefined;
  }

  async expectWithdrawn(d: DepositId) {
    const acc = await this.fetchDeposit(d);
    expect(acc.state.withdrawn).to.exist;
    expect(acc.state.unreported).to.be.undefined;
    expect(acc.state.reported).to.be.undefined;
  }
}

export type PromiseWithResolvers<T> = {
  promise: Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: unknown) => void;
};

/**
 * A polyfill for Promise.withResolvers
 * @return {PromiseWithResolvers} An object containing a promise and its resolve and reject functions
 */
export function promiseWithResolvers<T>(): PromiseWithResolvers<T> {
  let resolve: (value: T | PromiseLike<T>) => void;
  let reject: (reason?: unknown) => void;
  return {
    promise: new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    }),
    // @ts-expect-error TypeScript doesn't know that the promise constructor callback is called immediately, so this value is populated
    resolve,
    // @ts-expect-error TypeScript doesn't know that the promise constructor callback is called immediately, so this value is populated
    reject,
  };
}
