import * as anchor from "@coral-xyz/anchor";

import { Keypair, PublicKey, SendTransactionError } from "@solana/web3.js";
import { BankrunProvider, startAnchor } from "anchor-bankrun";
import { Program } from "@coral-xyz/anchor";
import { Bascule } from "../target/types/bascule";
import { expect } from "chai";
import { SYSTEM_PROGRAM_ID } from "@coral-xyz/anchor/dist/cjs/native/system";

import {
  DepositId,
  EAlreadyWithdrawn,
  EMaxValidators,
  ENotAdmin,
  ENotPauser,
  ENotReporter,
  ENotValidator,
  EPaused,
  EWithdrawalFailedValidation,
  assertError,
  delayMs,
  rpcOpts
} from "./util";
import * as util from "./util";

import BASCULE_IDL from "./../target/idl/bascule.json";

describe("bascule", () => {
  let provider: BankrunProvider;
  let program: Program<Bascule>;
  let ts: util.TestSetup;

  // Helper that calls the 'initialize' method using the default wallet
  const callInit = (wallet: anchor.Wallet) =>
    program.methods.initialize().accounts({ payer: wallet.publicKey }).signers([wallet.payer]).rpc(rpcOpts);

  // Waits until the blockhash changes
  const untilNextBlockHash = async () => {
    const bh0 = await provider.context.banksClient.getLatestBlockhash(rpcOpts.commitment);
    for (let i = 0; i < 10; i++) {
      await delayMs(50);
      const bh1 = await provider.context.banksClient.getLatestBlockhash(rpcOpts.commitment);
      if (bh1?.[0] !== bh0?.[0]) return;
    }
    throw new Error("Blockhash didn't change");
  };

  beforeEach(async () => {
    const pauser = new anchor.Wallet(Keypair.generate());
    const reporter = new anchor.Wallet(Keypair.generate());
    const validator = new anchor.Wallet(Keypair.generate());
    const other = new anchor.Wallet(Keypair.generate());

    const context = await startAnchor(
      ".",
      [],
      [pauser, reporter, validator, other].map(w => {
        return {
          address: w.publicKey,
          info: {
            lamports: 1_000_000_000, // 1 SOL equivalent
            data: Buffer.alloc(0),
            owner: SYSTEM_PROGRAM_ID,
            executable: false
          }
        };
      })
    );
    provider = new BankrunProvider(context);
    program = new Program<Bascule>(BASCULE_IDL as Bascule, provider);
    ts = new util.TestSetup(program, {
      admin: new anchor.Wallet(provider.context.payer),
      pauser,
      reporter,
      validator,
      other
    });

    // call initialize
    await callInit(ts.acc.admin);
  });

  // Checks:
  // - initial state of the BasculeData account
  // - double initialization is not allowed (by either the same or different key)
  it("initialize", async () => {
    // check the initial state of the BasculeData account
    const bd = await ts.fetchData();
    console.log("Initial data", bd);

    const admin = ts.acc.admin;
    expect(bd.admin).to.deep.equal(admin.publicKey);
    expect(bd.isPaused).to.be.false;
    expect(bd.validateThreshold.toNumber()).to.eq(0);

    // cannot call initialize again with the same or different key
    for (const w of [admin, ts.acc.other]) {
      console.log("calling init again with wallet", w.publicKey.toBase58());
      const err = await assertError(callInit(w));
      expect(err).to.be.instanceOf(SendTransactionError);
      expect(((err as SendTransactionError)?.transactionLogs ?? [])[3]).to.match(/^Allocate: account Address.* already in use$/);
    }
  });

  // Checks:
  // - only admin can do it
  // - the update correctly updates the threshold
  // - cannot be done if the program is paused
  it("set threshold", async () => {
    const bd = await ts.fetchData();
    expect(bd.validateThreshold.toNumber()).to.eq(0);

    const newThreshold = new anchor.BN(1234567890);

    // not allowed by non-admin
    await assertError(
      program.methods
        .updateValidateThreshold(newThreshold)
        .accounts({ admin: ts.acc.other.publicKey })
        .signers([ts.acc.other.payer])
        .rpc(rpcOpts),
      ENotAdmin
    );

    // allowed by admin
    await program.methods
      .updateValidateThreshold(newThreshold)
      .accounts({ admin: ts.acc.admin.publicKey })
      .signers([ts.acc.admin.payer])
      .rpc(rpcOpts);

    // assert update worked
    const bd2 = await ts.fetchData();
    console.log("Updated data", bd2);
    expect(bd2.validateThreshold.eq(newThreshold)).to.be.true;

    // pause (the 'admin' key is still the 'pauser')
    const pauser = ts.acc.pauser;
    await program.methods
      .grantPauser(pauser.publicKey)
      .accounts({ admin: ts.acc.admin.publicKey })
      .signers([ts.acc.admin.payer])
      .rpc(rpcOpts);
    await program.methods.pause().accounts({ pauser: pauser.publicKey }).signers([pauser.payer]).rpc(rpcOpts);

    // not allowed even by admin while paused
    await assertError(ts.setThreshold(newThreshold), EPaused);

    // unpause and try again
    await program.methods.unpause().accounts({ pauser: pauser.publicKey }).signers([pauser.payer]).rpc(rpcOpts);

    // allowed after unpausing paused
    await ts.setThreshold(1);
    expect(await ts.fetchData().then(bd => bd.validateThreshold.toNumber())).to.eq(1);
  });

  // Checks:
  // - only admin grant pauser
  // - only pauser can call pause/unpause
  it("grant pauser", async () => {
    // grant pauser to 'ts.acc.pauser'
    await program.methods
      .grantPauser(ts.acc.pauser.publicKey)
      .accounts({ admin: ts.acc.admin.publicKey })
      .signers([ts.acc.admin.payer])
      .rpc(rpcOpts);

    // the pauser account cannot grant pauser to someone else
    await assertError(
      program.methods
        .grantPauser(ts.acc.other.publicKey)
        .accounts({ admin: ts.acc.pauser.publicKey })
        .signers([ts.acc.pauser.payer])
        .rpc(rpcOpts),
      ENotAdmin
    );

    // the admin cannot pause/unpause
    await assertError(
      program.methods.pause().accounts({ pauser: ts.acc.admin.publicKey }).signers([ts.acc.admin.payer]).rpc(rpcOpts),
      ENotPauser
    );
    await assertError(
      program.methods.unpause().accounts({ pauser: ts.acc.admin.publicKey }).signers([ts.acc.admin.payer]).rpc(rpcOpts),
      ENotPauser
    );

    // the pauser can pause and unpause
    await program.methods
      .pause()
      .accounts({ pauser: ts.acc.pauser.publicKey })
      .signers([ts.acc.pauser.payer])
      .rpc(rpcOpts);
    expect(await ts.fetchData().then(bd => bd.isPaused)).to.be.true;
    await program.methods
      .unpause()
      .accounts({ pauser: ts.acc.pauser.publicKey })
      .signers([ts.acc.pauser.payer])
      .rpc(rpcOpts);
    expect(await ts.fetchData().then(bd => bd.isPaused)).to.be.false;
  });

  // Checks:
  // - once paused, the following operations are disallowed
  //   - reporting
  //   - validating
  //   - changing the threshold
  it("paused", async () => {
    await ts.grantPermissions();

    // pause
    await program.methods
      .pause()
      .accounts({ pauser: ts.acc.pauser.publicKey })
      .signers([ts.acc.pauser.payer])
      .rpc(rpcOpts);

    const d = DepositId.randomForAmount(10);

    // reporting is disallowed
    await assertError(
      program.methods
        .reportDeposit(d.depositId)
        .accounts({ reporter: ts.acc.reporter.publicKey })
        .signers([ts.acc.reporter.payer])
        .rpc(rpcOpts),
      EPaused
    );

    // validating is disallowed
    await assertError(ts.validateWithdrawal(d), EPaused);

    // changing the threshold is disallowed
    await assertError(ts.setThreshold(10), EPaused);
  });

  // Checks:
  // - only 'reporter' can report
  // - reporting the same deposit multiple times is allowed
  // - reporting a deposit id of a wrong length is outright denied
  it("report", async () => {
    const depositId = [...Array(32)].map(_ => 0);

    // grant reporter
    await program.methods
      .grantReporter(ts.acc.reporter.publicKey)
      .accounts({ admin: ts.acc.admin.publicKey })
      .signers([ts.acc.admin.payer])
      .rpc(rpcOpts);

    // cannot be called by anyone else
    await assertError(
      program.methods
        .reportDeposit(depositId)
        .accounts({ reporter: ts.acc.admin.publicKey })
        .signers([ts.acc.admin.payer])
        .rpc(rpcOpts),
      ENotReporter
    );

    // can be called by the reporter, multiple times
    for (const _i of [0, 1]) {
      // don't try to submit the same transaction too quickly (with the same blockhash)
      await untilNextBlockHash();

      await program.methods
        .reportDeposit(depositId)
        .accounts({ reporter: ts.acc.reporter.publicKey })
        .signers([ts.acc.reporter.payer])
        .rpc(rpcOpts);

      // retrieve the account info and assert the status
      const [depositPda, bump] = PublicKey.findProgramAddressSync(
        [Buffer.from("deposit"), Buffer.from(depositId)],
        program.programId
      );
      const deposit = await program.account.deposit.fetch(depositPda, rpcOpts.commitment);
      expect(deposit.bump).to.eq(bump);
      expect(deposit.state.reported).to.exist;
      expect(deposit.state.withdrawn).to.be.undefined;
    }

    // deposit id of a wrong length is rejected
    await assertError(
      program.methods
        .reportDeposit([0, 1, 2, 3])
        .accounts({ reporter: ts.acc.reporter.publicKey })
        .signers([ts.acc.reporter.payer])
        .rpc(rpcOpts),
      "InstructionDidNotDeserialize"
    );
  });

  // Checks:
  // - nobody is allowed to validate upon initialization
  // - explicitly allowlisted wallets are allowed to validate
  // - no more than 10 validators can be allowlisted
  it("add/remove validators", async () => {
    const d = DepositId.randomForAmount(10);

    // not allowed to validate before explicitly allowing
    const validators = [ts.acc.admin, ts.acc.validator];
    for (const v of validators) {
      await assertError(
        program.methods
          .validateWithdrawal(d.depositId, d.recipient, d.amount, [...d.txId], d.txVout)
          .accounts({ validator: v.publicKey, payer: v.publicKey })
          .signers([v.payer])
          .rpc(rpcOpts),
        ENotValidator
      );
    }

    // grant validators
    const admin = ts.acc.admin;
    for (const validator of validators) {
      await program.methods
        .addWithdrawalValidator(validator.publicKey)
        .accounts({ admin: admin.publicKey })
        .signers([admin.payer])
        .rpc(rpcOpts);
    }

    // now both are allowed to validate (still fails because the deposit has not been reported)
    for (const validator of validators) {
      await assertError(
        program.methods
          .validateWithdrawal(d.depositId, d.recipient, d.amount, [...d.txId], d.txVout)
          .accounts({ validator: validator.publicKey, payer: validator.publicKey })
          .signers([validator.payer])
          .rpc(rpcOpts),
        "EWithdrawalFailedValidation"
      );
    }

    // increase the threshold so that validation trivially passes
    await ts.setThreshold(d.amount.toNumber() + 1);

    // remove admin from validators
    await program.methods
      .removeWithdrawalValidator(admin.publicKey)
      .accounts({ admin: admin.publicKey })
      .signers([admin.payer])
      .rpc(rpcOpts);

    // admin is not allowed to validate but validator is
    for (const v of validators) {
      const rpc = program.methods
        .validateWithdrawal(d.depositId, d.recipient, d.amount, [...d.txId], d.txVout)
        .accounts({ validator: v.publicKey, payer: v.publicKey })
        .signers([v.payer])
        .rpc(rpcOpts);
      if (v == admin) {
        await assertError(rpc, ENotValidator);
      } else {
        await rpc;
      }
    }

    // add 10 more validators; the first 9 should fill up the capacity, the 10th should fail with EMaxValidators
    for (let i = 0; i < 10; i++) {
      const v = new anchor.Wallet(Keypair.generate());
      const rpc = program.methods
        .addWithdrawalValidator(v.publicKey)
        .accounts({ admin: admin.publicKey })
        .signers([admin.payer])
        .rpc(rpcOpts);
      if (i < 9) {
        await rpc;
      } else {
        await assertError(rpc, EMaxValidators);
      }
    }
  });

  for (const reportFirst of [true, false]) {
    it(`validate with different payer (report first: ${reportFirst})`, async () => {
      // grant 'reporter' to the default reporter
      await ts.grantReporter(ts.acc.reporter.publicKey);

      const d = DepositId.randomForAmount(10);

      // set the threshold to be higher than the deposit amount
      await ts.setThreshold(d.amount.toNumber() + 1);

      // optionally report the deposit
      if (reportFirst) {
        await ts.reportDeposit(d);
        await ts.expectReported(d);
      }

      // grant 'validator' to a new (unfunded) wallet
      const unfundedValidator = new anchor.Wallet(Keypair.generate());
      await ts.grantValidator(unfundedValidator.publicKey);

      const validateRpc = ts.validateWithdrawal(d, unfundedValidator, unfundedValidator);
      if (reportFirst) {
        // paying with the unfunded wallet should work, because the deposit account
        // already exists, so no payment is needed
        await validateRpc;
      } else {
        // paying with the unfunded wallet should not work, because the deposit account
        // does not exist and needs to be created, which requires payment
        const err = await assertError(validateRpc);
        expect(err).to.be.instanceOf(SendTransactionError);
        expect(((err as SendTransactionError)?.logs ?? [])[3]).to.match(/insufficient lamports 0/);

        // but paying with a separate (funded) wallet should work
        await ts.validateWithdrawal(d, unfundedValidator, ts.acc.other);
      }

      // either way, the deposit should be marked as 'withdrawn' by now
      await ts.expectWithdrawn(d);
    });
  }

  // Checks:
  // - when validating a withdrawal below the threshold
  //   - first time works (irrespective of whether or not the deposit was previously reported)
  //   - the second time fails with 'EAlreadyWithdrawn'
  for (const reportFirst of [true, false]) {
    it(`validate below threshold (report first: ${reportFirst})`, async () => {
      await ts.grantPermissions();

      // set threshold
      const threshold = 100;
      await ts.setThreshold(threshold);

      const depositId = DepositId.randomForAmount(10);

      // optionally report first
      if (reportFirst) {
        await ts.reportDeposit(depositId);
      }

      // validate succeeds because the amount is below the threshold
      await ts.validateWithdrawal(depositId);

      // avoid re-sending the same tx too soon (with the same blockhash)
      await untilNextBlockHash();

      // validating the same deposit again now fails with EAlreadyWithdrawn
      await assertError(ts.validateWithdrawal(depositId), EAlreadyWithdrawn);
    });
  }

  // Checks:
  // - when validating a withdrawal above the threshold
  //   - works IFF already reported
  //   - if not already reported, after the initial validation failure:
  //     - reporting the deposit works
  //     - afterwards, validating withdrawal works too
  for (const reportFirst of [true]) {
    it(`validate above threshold (previously reported: ${reportFirst})`, async () => {
      await ts.grantPermissions();

      // set threshold
      const threshold = 100;
      await ts.setThreshold(threshold);

      const depositId = DepositId.randomForAmount(2000);

      // optionally report first
      if (reportFirst) {
        await ts.reportDeposit(depositId);
      }

      // validate succeeds because the amount is below the threshold
      const rpc = ts.validateWithdrawal(depositId);
      if (reportFirst) {
        await rpc;
      } else {
        await assertError(rpc, EWithdrawalFailedValidation);
        // trying to validate again fails again
        await assertError(ts.validateWithdrawal(depositId), EWithdrawalFailedValidation);
        // reporting can still be done
        await ts.reportDeposit(depositId);
        // and then validation works too
        await ts.validateWithdrawal(depositId);
      }
    });
  }
});
