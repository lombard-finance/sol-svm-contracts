import { expect } from "chai";
import * as anchor from "@coral-xyz/anchor";
import { keccak_256 } from "@noble/hashes/sha3";
import {
  ConfirmOptions,
  Keypair,
  PublicKey,
  SendTransactionError,
} from "@solana/web3.js";
import { Bascule } from "../target/types/bascule";

export const BASCULE_IDL = require("./../target/idl/bascule.json");

export const EPaused = "EPaused";
export const ENotAdmin = "ENotAdmin";
export const ENotPauser = "ENotPauser";
export const ENotReporter = "ENotReporter";
export const ENotValidator = "ENotValidator";
export const EMaxValidators = "EMaxValidators";
export const EAlreadyWithdrawn = "EAlreadyWithdrawn";
export const EWithdrawalFailedValidation = "EWithdrawalFailedValidation";

export const rpcOpts: ConfirmOptions = { commitment: "confirmed" };

export interface TestAccounts {
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
    // fixed-bytes32(0x00) || 0x03, 0x53, 0x4f, 0x4c || recipient || amount (BE) || txId || txVout (BE)
    const bytes = [];
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

export async function assertError(
  p: Promise<any>,
  code?: string
): Promise<Error> {
  const err = await p.then((_) => undefined).catch((e) => e);
  expect(err).to.not.be.undefined;
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

  constructor(
    readonly program: anchor.Program<Bascule>,
    acc: TestAccounts | anchor.Wallet
  ) {
    this.acc =
      acc instanceof anchor.Wallet
        ? {
            admin: acc,
            pauser: new anchor.Wallet(Keypair.generate()),
            reporter: new anchor.Wallet(Keypair.generate()),
            validator: new anchor.Wallet(Keypair.generate()),
            other: new anchor.Wallet(Keypair.generate()),
          }
        : acc;
    [this.basculePda] = PublicKey.findProgramAddressSync(
      [Buffer.from("bascule")],
      program.programId
    );
  }

  get provider() {
    return this.program.provider;
  }

  async init() {
    // fund accounts
    for (const w of [
      this.acc.pauser,
      this.acc.reporter,
      this.acc.validator,
      this.acc.other,
    ]) {
      await this.provider.connection.requestAirdrop(
        w.publicKey,
        10_000_000_000
      );
    }

    // call the initialize method
    await this.program.methods
      .initialize()
      .accounts({ payer: this.acc.admin.publicKey })
      .signers([this.acc.admin.payer])
      .rpc(rpcOpts);

    // grant permissions to accounts
    await this.grantPermissions();
  }

  /**
   * Grant the 'pauser', 'reporter', and 'validator'
   * permissions to the designated test wallets.
   */
  async grantPermissions() {
    console.log("grant pauser to", this.acc.pauser.publicKey.toBase58());
    await this.program.methods
      .grantPauser(this.acc.pauser.publicKey)
      .accounts({ admin: this.acc.admin.publicKey })
      .signers([this.acc.admin.payer])
      .rpc(rpcOpts);

    console.log("grant reporter to", this.acc.reporter.publicKey.toBase58());
    await this.program.methods
      .grantReporter(this.acc.reporter.publicKey)
      .accounts({ admin: this.acc.admin.publicKey })
      .signers([this.acc.admin.payer])
      .rpc(rpcOpts);

    console.log("grant validator to", this.acc.validator.publicKey.toBase58());
    await this.program.methods
      .addWithdrawalValidator(this.acc.validator.publicKey)
      .accounts({ admin: this.acc.admin.publicKey })
      .signers([this.acc.admin.payer])
      .rpc(rpcOpts);
  }

  /**
   * Update validate threshold using the designated 'admin' account.
   */
  async setThreshold(amount: number | anchor.BN) {
    return await this.program.methods
      .updateValidateThreshold(new anchor.BN(amount))
      .accounts({ admin: this.acc.admin.publicKey })
      .signers([this.acc.admin.payer])
      .rpc(rpcOpts);
  }

  /**
   * Pause the program using the designated 'admin' account
   */
  async pause() {
    return await this.program.methods
      .pause()
      .accounts({ pauser: this.acc.pauser.publicKey })
      .signers([this.acc.pauser.payer])
      .rpc(rpcOpts);
  }

  /**
   * Unpause the program using the designated 'admin' account
   */
  async unpause() {
    return await this.program.methods
      .unpause()
      .accounts({ pauser: this.acc.admin.publicKey })
      .signers([this.acc.admin.payer])
      .rpc(rpcOpts);
  }

  /**
   * Report deposit using the using the designated 'reporter' account.
   */
  async reportDeposit(depositId: number[] | DepositId) {
    return await this.program.methods
      .reportDeposit(
        depositId instanceof DepositId ? depositId.depositId : depositId
      )
      .accounts({ reporter: this.acc.reporter.publicKey })
      .signers([this.acc.reporter.payer])
      .rpc(rpcOpts);
  }

  /**
   * Validate deposit withdrawal using the using the designated 'validator' account.
   */
  async validateWithdrawal(d: DepositId) {
    return await this.program.methods
      .validateWithdrawal(
        d.depositId,
        d.recipient,
        d.amount,
        [...d.txId],
        d.txVout
      )
      .accounts({ validator: this.acc.validator.publicKey })
      .signers([this.acc.validator.payer])
      .rpc(rpcOpts);
  }

  /**
   * Fetch the current 'BasculeData' account
   */
  async fetchData() {
    return await this.program.account.basculeData.fetch(
      this.basculePda,
      rpcOpts.commitment
    );
  }

  /**
   * Fetch the current 'BasculeDeposit' account for a given deposit id
   */
  async fetchDeposit(d: DepositId) {
    const [depositPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("deposit"), Buffer.from(d.depositId)],
      this.program.programId
    );
    return await this.program.account.deposit.fetch(
      depositPda,
      rpcOpts.commitment
    );
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
  reject: (reason?: any) => void;
};

/**
 * A polyfill for Promise.withResolvers
 * @return {PromiseWithResolvers} An object containing a promise and its resolve and reject functions
 */
export function promiseWithResolvers<T>(): PromiseWithResolvers<T> {
  let resolve: (value: T | PromiseLike<T>) => void;
  let reject: (reason?: any) => void;
  return {
    promise: new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    }),
    resolve,
    reject,
  };
}
