//! Validator instructions

use anchor_lang::prelude::*;

use crate::{
    errors::BasculeError,
    events::{WithdrawalNotValidated, WithdrawalValidated},
    state::{BasculeData, Deposit, DepositId, DepositState, BASCULE_SEED, DEPOSIT_SEED},
};

use anchor_lang::solana_program::keccak::hash;

/// Account constraints for the instructions that require 'validator' permissions.
#[derive(Accounts)]
// CODESYNC(validate-args)
#[instruction(
    deposit_id: DepositId,
    recipient: Pubkey,
    amount: u64,
    tx_id: [u8; 32],
    tx_vout: u32
)]
pub struct Validator<'info> {
    /// The account signing this instruction
    #[account(
        // CHECK: the signer is allowlisted in 'bascule_data.withdrawal_validators'
        constraint = bascule_data.withdrawal_validators.contains(&validator.key()) @ BasculeError::ENotValidator,
        // CHECK: the program is not paused
        constraint = !bascule_data.is_paused @ BasculeError::EPaused,
        // CHECK: deposit id integrity
        constraint = deposit_id == to_deposit_id(recipient, amount, tx_id, tx_vout) @ BasculeError::EInvalidDepositId,
    )]
    validator: Signer<'info>,

    /// Pays for the 'Deposit' account creation if the account does not already exist; can be any account
    #[account(mut)]
    payer: Signer<'info>,

    /// The program state
    #[account(mut, seeds = [BASCULE_SEED], bump = bascule_data.bump)]
    bascule_data: Account<'info, BasculeData>,

    /// The deposit account
    #[account(
        // create the account if it doesn't already exist
        init_if_needed,
        // the payer pays for the account if it doesn't already exist
        payer = payer,
        // the PDA of the account: string "deposit" + the deposit id bytes
        seeds = [DEPOSIT_SEED, deposit_id.as_ref()], bump,
        // the fixed space for the account
        space = 8 + Deposit::INIT_SPACE,
    )]
    deposit: Account<'info, Deposit>,

    // The system program (needed for the 'init_if_needed' constraint of the 'deposit' account)
    system_program: Program<'info, System>,
}

/// Validate a withdrawal if the amount is above the threshold.
/// Trivially allow all withdrawals below the threshold (unless already withdrawn).
///
/// Requires:
/// - the signer has [Validator] permissions (errors with [BasculeError::ENotValidator])
/// - the program is not paused (errors with [BasculeError::EPaused])
///
/// Effects:
/// - sets the state of the corresponding [Deposit] to [DepositState::Withdrawn] if either
///   the amount is below the threshold or the deposit was previously reported.
///
/// Emits:
/// - [WithdrawalValidated] if the deposit is validated and marked as withdrawn
/// - [WithdrawalNotValidated] if the deposit is not validated (i.e., not previously reported)
///   but still marked as withdrawn because the amount is below the threshold
///
/// Errors:
/// - [BasculeError::EWithdrawalFailedValidation] - if validation fails (e.g.,
///   because the deposit is above the threshold and has not been reported yet)
/// - [BasculeError::EAlreadyWithdrawn] if already marked as withdrawn
pub fn validate_withdrawal(
    ctx: Context<Validator>,
    deposit_id: DepositId,
    amount: u64,
) -> Result<()> {
    let bascule_data = &ctx.accounts.bascule_data;
    let state = &mut ctx.accounts.deposit.state;
    match state {
        // already reported => mark as withdrawn
        DepositState::Reported => {
            *state = DepositState::Withdrawn;
            emit!(WithdrawalValidated { amount, deposit_id });
        }
        // already withdrawn => EAlreadyWithdrawn error
        DepositState::Withdrawn => {
            return err!(BasculeError::EAlreadyWithdrawn);
        }
        // not reported and above threshold => EWithdrawalFailedValidation error
        DepositState::Unreported if amount >= bascule_data.validate_threshold => {
            return err!(BasculeError::EWithdrawalFailedValidation);
        }
        // not reported and below threshold => allow but mark it as withdrawn
        DepositState::Unreported => {
            *state = DepositState::Withdrawn;
            emit!(WithdrawalNotValidated { amount, deposit_id });
        }
    }

    Ok(())
}

/// Computes the deposit id from deconstructed components using the following formula:
///
/// keccak256([0u8; 32] || [0x03, 0x53, 0x4f, 0x4c] || recipient || amount (be_bytes) || tx_id || tx_vout (be_bytes))
//
// TODO: synchronize this implementation with Lombard's
// CODESYNC(solana-deposit-id)
pub fn to_deposit_id(recipient: Pubkey, amount: u64, tx_id: [u8; 32], tx_vout: u32) -> DepositId {
    let mut hash_data = Vec::with_capacity(112);

    // CODESYNC(non-evm-prefix)
    // 32-bytes zero as prefix (to ensure unique prefix for EVM and non-EVM chains)
    hash_data.extend([0u8; 32]);

    // CODESYNC(solana-unique-id)
    // 4-bytes unique id for Solana (can be interpreted as: length(3) || "SOL")
    // This lets us use the same zero prefix with other chains as long as this id is unique
    hash_data.extend([0x03, 0x53, 0x4f, 0x4c]);

    // Transaction details
    hash_data.extend(recipient.as_array());
    hash_data.extend(amount.to_be_bytes());
    hash_data.extend(tx_id);
    hash_data.extend(tx_vout.to_be_bytes());

    // hash it
    hash(&hash_data).0
}
