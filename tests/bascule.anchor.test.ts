import * as anchor from "@coral-xyz/anchor";

import { Program } from "@coral-xyz/anchor";
import { Bascule } from "../target/types/bascule";
import { expect } from "chai";
import {
  DepositId,
  EAlreadyWithdrawn,
  ENotAdmin,
  ENotPauser,
  ENotReporter,
  ENotValidator,
  EPaused,
  EWithdrawalFailedValidation,
  assertError,
  TestSetup,
  rpcOpts,
  promiseWithResolvers
} from "./util";

describe("bascule", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const wallet = provider.wallet as anchor.Wallet;
  const program = anchor.workspace.Bascule as Program<Bascule>;
  const ts = new TestSetup(program, wallet);

  it("all in one", async () => {
    // call 'initialize' and grant permissions
    await ts.init();

    const d10 = DepositId.randomForAmount(10);
    const d100 = DepositId.randomForAmount(100);

    // access checks:
    // (1) pause not allowed to 'admin', 'reporter', and 'validator'
    for (const w of [ts.acc.admin, ts.acc.reporter, ts.acc.validator]) {
      await assertError(
        program.methods.pause().accounts({ pauser: w.publicKey }).signers([w.payer]).rpc(rpcOpts),
        ENotPauser
      );
    }
    // (2) update threshold not allowed to 'pauser', 'reporter', and 'validator'
    for (const w of [ts.acc.pauser, ts.acc.reporter, ts.acc.validator]) {
      await assertError(
        program.methods
          .updateValidateThreshold(new anchor.BN(10))
          .accounts({ admin: w.publicKey })
          .signers([w.payer])
          .rpc(rpcOpts),
        ENotAdmin
      );
    }
    // (3) grant pauser/reporter/validator not allowed to 'pauser', 'reporter', and 'validator'
    for (const w of [ts.acc.pauser, ts.acc.reporter, ts.acc.validator]) {
      await assertError(
        program.methods
          .grantPauser(ts.acc.other.publicKey)
          .accounts({ admin: w.publicKey })
          .signers([w.payer])
          .rpc(rpcOpts),
        ENotAdmin
      );
      await assertError(
        program.methods
          .grantReporter(ts.acc.other.publicKey)
          .accounts({ admin: w.publicKey })
          .signers([w.payer])
          .rpc(rpcOpts),
        ENotAdmin
      );
      await assertError(
        program.methods
          .addWithdrawalValidator(ts.acc.other.publicKey)
          .accounts({ admin: w.publicKey })
          .signers([w.payer])
          .rpc(rpcOpts),
        ENotAdmin
      );
    }
    // (4) report deposit is not allowed to 'admin', 'pauser', 'validator'
    for (const w of [ts.acc.admin, ts.acc.pauser, ts.acc.validator]) {
      await assertError(
        program.methods
          .reportDeposit(d10.depositId)
          .accounts({ reporter: w.publicKey })
          .signers([w.payer])
          .rpc(rpcOpts),
        ENotReporter
      );
    }
    // (5) validate withdrawal is not allowed to 'admin', 'pauser', 'reporter'
    for (const w of [ts.acc.admin, ts.acc.pauser, ts.acc.reporter]) {
      await assertError(
        program.methods
          .validateWithdrawal(d10.depositId, d10.recipient, d10.amount, [...d10.txId], d10.txVout)
          .accounts({ validator: w.publicKey })
          .signers([w.payer])
          .rpc(rpcOpts),
        ENotValidator
      );
    }

    const listeners = [];

    try {
      // set threshold to 50 and validate event is emitted
      const evUpdateThreshold = promiseWithResolvers<anchor.IdlEvents<Bascule>["updateValidateThreshold"]>();
      listeners.push(program.addEventListener("updateValidateThreshold", evUpdateThreshold.resolve));
      await ts.setThreshold(50);
      {
        const ev = await evUpdateThreshold.promise;
        expect(ev.oldThreshold.toNumber()).to.eq(0);
        expect(ev.newThreshold.toNumber()).to.eq(50);
      }

      // double check the bascule data was updated
      expect(await ts.fetchData().then(d => d.validateThreshold.toNumber())).to.eq(50);

      // validating d10 is allowed because below threshold, but it emits an event
      const evNotValidated = promiseWithResolvers<anchor.IdlEvents<Bascule>["withdrawalNotValidated"]>();
      listeners.push(program.addEventListener("withdrawalNotValidated", evNotValidated.resolve));
      await ts.validateWithdrawal(d10);
      await ts.expectWithdrawn(d10);
      {
        const ev = await evNotValidated.promise;
        expect(ev.amount.toNumber()).to.eq(10);
        expect(ev.depositId).to.deep.eq(d10.depositId);
      }

      // still, cannot withdraw multiple times
      await assertError(ts.validateWithdrawal(d10), EAlreadyWithdrawn);
      await ts.expectWithdrawn(d10);

      // validating d100 is NOT allowed because above threshold
      await assertError(ts.validateWithdrawal(d100), EWithdrawalFailedValidation);

      // we can still report it
      const evDepositReported = promiseWithResolvers<anchor.IdlEvents<Bascule>["depositReported"]>();
      listeners.push(program.addEventListener("depositReported", evDepositReported.resolve));
      await ts.reportDeposit(d100);
      await ts.expectReported(d100);
      {
        const ev = await evDepositReported.promise;
        expect(ev.depositId).to.deep.eq(d100.depositId);
      }

      // and then validate it
      const evValidated = promiseWithResolvers<anchor.IdlEvents<Bascule>["withdrawalValidated"]>();
      listeners.push(program.addEventListener("withdrawalValidated", evValidated.resolve));
      await ts.validateWithdrawal(d100);
      await ts.expectWithdrawn(d100);
      {
        const ev = await evValidated.promise;
        expect(ev.amount.toNumber()).to.eq(100);
        expect(ev.depositId).to.deep.eq(d100.depositId);
      }

      // reporting previously reported or withdrawn deposit is ok
      const evAlreadyReported = promiseWithResolvers<anchor.IdlEvents<Bascule>["alreadyReported"]>();
      listeners.push(program.addEventListener("alreadyReported", evAlreadyReported.resolve));
      await ts.reportDeposit(d100);
      await ts.expectWithdrawn(d100);
      {
        const ev = await evAlreadyReported.promise;
        expect(ev.depositId).to.deep.eq(d100.depositId);
      }

      // pause and assert that reporting, validating, and updating threshold are all disallowed
      await ts.pause();
      await assertError(ts.reportDeposit(d10), EPaused);
      await assertError(ts.validateWithdrawal(d10), EPaused);
      await assertError(ts.setThreshold(0), EPaused);
    } finally {
      // ensure to remove all listeners, otherwise 'anchor test' will remain stuck
      for (const listener of listeners) {
        await program.removeEventListener(listener);
      }
    }
  });
});
