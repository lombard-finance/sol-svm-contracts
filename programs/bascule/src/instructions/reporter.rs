//! Reporter instructions (may be performed by the 'reporter' account only)

use anchor_lang::prelude::*;

use crate::{
    errors::BasculeError,
    events::{AlreadyReported, DepositReported},
    state::{BasculeData, Deposit, DepositId, DepositState, BASCULE_SEED, DEPOSIT_SEED},
};

/// Account constraints for the instructions that require 'reporter' permissions.
#[derive(Accounts)]
#[instruction(deposit_id: DepositId)]
pub struct Reporter<'info> {
    /// The system account paying for this instruction
    #[account(
        mut,
        // CHECK: the signer is the 'bascule_data.reporter'
        address = bascule_data.deposit_reporter @ BasculeError::ENotReporter,
        // CHECK: the program is not paused
        constraint = !bascule_data.is_paused @ BasculeError::EPaused
    )]
    reporter: Signer<'info>,

    /// The program state
    #[account(seeds = [BASCULE_SEED], bump = bascule_data.bump)]
    bascule_data: Account<'info, BasculeData>,

    /// The deposit account
    #[account(
        // create account if it doesn't already exist; its initial state will be 'Unreported'
        init_if_needed,
        // the reporter pays for the account
        payer = reporter,
        // the PDA of the account: string "deposit" + the deposit id bytes
        seeds = [DEPOSIT_SEED, deposit_id.as_ref()], bump,
        // the fixed space for the account
        space = 8 + Deposit::INIT_SPACE
    )]
    deposit: Account<'info, Deposit>,

    /// The system program (needed for the 'init_if_needed' constraint of the 'deposit' account)
    system_program: Program<'info, System>,
}

/// Reports a deposit
///
/// Requires:
/// - the signer has [Reporter] permissions (errors with [BasculeError::ENotReporter])
/// - the program is not paused (errors with [BasculeError::EPaused])
///
/// Effects:
/// - initializes a [Deposit] whose PDA is derived from `[b"deposit", deposit_id.as_ref()]`
/// - sets the [Deposit::state] of the new deposit to [DepositState::Reported]
///
/// Emits:
/// - [DepositReported] if reported for the first time
/// - [AlreadyReported] if already reported
pub fn report_deposit(ctx: Context<Reporter>, deposit_id: DepositId) -> Result<()> {
    let status = &ctx.accounts.deposit.state;
    match status {
        DepositState::Unreported => {
            ctx.accounts.deposit.state = DepositState::Reported;
            ctx.accounts.deposit.bump = ctx.bumps.deposit;
            emit!(DepositReported { deposit_id });
        }
        _ => {
            emit!(AlreadyReported {
                deposit_id,
                status: status.clone()
            })
        }
    }

    Ok(())
}
