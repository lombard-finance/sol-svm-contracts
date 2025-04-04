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
  promiseWithResolvers,
} from "./util";

describe("bascule", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const wallet = provider.wallet as anchor.Wallet;
  const program = anchor.workspace.Bascule as Program<Bascule>;
  const ts = new TestSetup(program, wallet);

  it("all in one", async () => {
    // fund accounts
    await ts.fundAccounts();

    // 'initialize' fails when executed by an account different from the program upgrade authority
    await assertError(ts.init(ts.acc.other), "ENotDeployer");

    // 'initialize' works when executed by the program deployer (i.e., upgrade authority)
    await ts.init(wallet);
    const basculeData = await ts.fetchData();
    expect(basculeData.admin.toBase58()).to.eq(
      ts.acc.admin.publicKey.toBase58()
    );

    const d10 = DepositId.randomForAmount(10);
    const d100 = DepositId.randomForAmount(100);

    // access checks:
    // (1) pause not allowed to 'deployer', 'admin', 'reporter', and 'validator'
    for (const w of [
      ts.acc.deployer,
      ts.acc.admin,
      ts.acc.reporter,
      ts.acc.validator,
    ]) {
      await assertError(ts.pause(w), ENotPauser);
    }
    // (2) update threshold not allowed to 'deployer', 'pauser', 'reporter', and 'validator'
    for (const w of [
      ts.acc.deployer,
      ts.acc.pauser,
      ts.acc.reporter,
      ts.acc.validator,
    ]) {
      await assertError(ts.setThreshold(new anchor.BN(10), w), ENotAdmin);
    }
    // (3) grant pauser/reporter/validator not allowed to 'pauser', 'reporter', and 'validator'
    for (const w of [ts.acc.pauser, ts.acc.reporter, ts.acc.validator]) {
      await assertError(ts.grantPauser(ts.acc.other.publicKey, w), ENotAdmin);
      await assertError(ts.grantReporter(ts.acc.other.publicKey, w), ENotAdmin);
      await assertError(
        ts.grantValidator(ts.acc.other.publicKey, w),
        ENotAdmin
      );
    }
    // (4) report deposit is not allowed to 'deployer', 'admin', 'pauser', 'validator'
    for (const w of [
      ts.acc.deployer,
      ts.acc.admin,
      ts.acc.pauser,
      ts.acc.validator,
    ]) {
      await assertError(ts.reportDeposit(d10.depositId, w), ENotReporter);
    }
    // (5) validate withdrawal is not allowed to 'deployer', 'admin', 'pauser', 'reporter'
    for (const w of [
      ts.acc.deployer,
      ts.acc.admin,
      ts.acc.pauser,
      ts.acc.reporter,
    ]) {
      await assertError(ts.validateWithdrawal(d10, w), ENotValidator);
    }

    const listeners: number[] = [];

    try {
      // set threshold to 50 and validate event is emitted
      const evUpdateThreshold =
        promiseWithResolvers<
          anchor.IdlEvents<Bascule>["updateValidateThreshold"]
        >();
      listeners.push(
        program.addEventListener(
          "updateValidateThreshold",
          evUpdateThreshold.resolve
        )
      );
      await ts.setThreshold(50);
      {
        const ev = await evUpdateThreshold.promise;
        expect(ev.oldThreshold.toNumber()).to.eq(0);
        expect(ev.newThreshold.toNumber()).to.eq(50);
      }

      // double check the bascule data was updated
      expect(
        await ts.fetchData().then((d) => d.validateThreshold.toNumber())
      ).to.eq(50);

      // validating d10 is allowed because below threshold, but it emits an event
      const evNotValidated =
        promiseWithResolvers<
          anchor.IdlEvents<Bascule>["withdrawalNotValidated"]
        >();
      listeners.push(
        program.addEventListener(
          "withdrawalNotValidated",
          evNotValidated.resolve
        )
      );
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
      await assertError(
        ts.validateWithdrawal(d100),
        EWithdrawalFailedValidation
      );

      // we can still report it
      const evDepositReported =
        promiseWithResolvers<anchor.IdlEvents<Bascule>["depositReported"]>();
      listeners.push(
        program.addEventListener("depositReported", evDepositReported.resolve)
      );
      await ts.reportDeposit(d100);
      await ts.expectReported(d100);
      {
        const ev = await evDepositReported.promise;
        expect(ev.depositId).to.deep.eq(d100.depositId);
      }

      // and then validate it
      const evValidated =
        promiseWithResolvers<
          anchor.IdlEvents<Bascule>["withdrawalValidated"]
        >();
      listeners.push(
        program.addEventListener("withdrawalValidated", evValidated.resolve)
      );
      await ts.validateWithdrawal(d100);
      await ts.expectWithdrawn(d100);
      {
        const ev = await evValidated.promise;
        expect(ev.amount.toNumber()).to.eq(100);
        expect(ev.depositId).to.deep.eq(d100.depositId);
      }

      // reporting previously reported or withdrawn deposit is ok
      const evAlreadyReported =
        promiseWithResolvers<anchor.IdlEvents<Bascule>["alreadyReported"]>();
      listeners.push(
        program.addEventListener("alreadyReported", evAlreadyReported.resolve)
      );
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

      // unpause and assert that reporting, validating, and updating threshold works again.
      await ts.unpause();
      await ts.setThreshold(0);
      const d0 = DepositId.randomForAmount(0);
      await ts.reportDeposit(d0);
      await ts.expectReported(d0);
      await ts.validateWithdrawal(d0);
      await ts.expectWithdrawn(d0);

      const newAdmin = ts.acc.other;

      // only admin can initiate admin transfer
      for (const w of [ts.acc.deployer, ts.acc.other]) {
        await assertError(
          ts.transferAdminInit(newAdmin.publicKey, w),
          ENotAdmin
        );
      }

      // transfer admin to 'ts.acc.other'
      const evAdminTransferInit =
        promiseWithResolvers<
          anchor.IdlEvents<Bascule>["adminTransferInitiated"]
        >();
      listeners.push(
        program.addEventListener(
          "adminTransferInitiated",
          evAdminTransferInit.resolve
        )
      );
      await ts.transferAdminInit(newAdmin.publicKey, ts.acc.admin);
      {
        const ev = await evAdminTransferInit.promise;
        expect(ev.currentAdmin).to.deep.eq(ts.acc.admin.publicKey);
        expect(ev.pendingAdmin).to.deep.eq(newAdmin.publicKey);
      }

      // the current admin is still the admin
      {
        const bd = await ts.fetchData();
        expect(bd.admin).to.deep.eq(ts.acc.admin.publicKey);
        await assertError(ts.setThreshold(101, newAdmin), ENotAdmin);
      }

      // accept transfer
      const evAdminTransferAccept =
        promiseWithResolvers<
          anchor.IdlEvents<Bascule>["adminTransferAccepted"]
        >();
      listeners.push(
        program.addEventListener(
          "adminTransferAccepted",
          evAdminTransferAccept.resolve
        )
      );
      await ts.transferAdminAccept(newAdmin);
      {
        const ev = await evAdminTransferAccept.promise;
        expect(ev.newAdmin).to.deep.eq(newAdmin.publicKey);
      }

      // the new admin is the admin
      {
        let bd = await ts.fetchData();
        expect(bd.admin).to.deep.eq(newAdmin.publicKey);
        await assertError(ts.setThreshold(101, ts.acc.admin), ENotAdmin);
        await ts.setThreshold(101, newAdmin);
        bd = await ts.fetchData();
        expect(bd.validateThreshold.toNumber()).to.eq(101);
      }
    } finally {
      // ensure to remove all listeners, otherwise 'anchor test' will remain stuck
      for (const listener of listeners) {
        await program.removeEventListener(listener);
      }
    }
  });
});
