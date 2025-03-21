//! Admin instructions (may be performed by the 'admin' account only)

use anchor_lang::prelude::*;

use crate::{
    errors::BasculeError,
    events::UpdateValidateThreshold,
    state::{BasculeData, BASCULE_SEED, MAX_VALIDATORS},
};

/// Account constraints for the instructions that require 'admin' permissions.
//
// NOTE: in EVM and SUI bascule this is called "owner"; here we call it "admin"
//       to disambiguate from the Solana-defined account owner.
#[derive(Accounts)]
pub struct Admin<'info> {
    /// The system account paying for this instruction
    /// CHECK: equals to 'bascule_data.admin'
    #[account(address = bascule_data.admin @ BasculeError::ENotAdmin)]
    admin: Signer<'info>,

    /// The program state
    #[account(mut, seeds = [BASCULE_SEED], bump = bascule_data.bump)]
    bascule_data: Account<'info, BasculeData>,
}

/// Updates the validate threshold.
///
/// Note that unlike the EVM Bascule contract, there is no separate role for the validation threshold guardian.
/// This contract simply re-uses the admin role.
///
/// Requires:
/// - the signer has [Admin] permissions (errors with [BasculeError::ENotAdmin])
/// - the program is not paused (errors with [BasculeError::EPaused])
///
/// Effects:
/// - sets [BasculeData::validate_threshold] to `new_threshold`
///
/// Emits:
/// - [UpdateValidateThreshold]
pub fn update_validate_threshold(ctx: Context<Admin>, new_threshold: u64) -> Result<()> {
    require!(!ctx.accounts.bascule_data.is_paused, BasculeError::EPaused);

    let old_threshold = ctx.accounts.bascule_data.validate_threshold;
    ctx.accounts.bascule_data.validate_threshold = new_threshold;

    emit!(UpdateValidateThreshold {
        old_threshold,
        new_threshold
    });

    Ok(())
}

/// Updates the pauser account.
///
/// Requires:
/// - the signer has [Admin] permissions (errors with [BasculeError::ENotAdmin])
///
/// Effects:
/// - sets [BasculeData::pauser] to `pauser`, overwriting the previous pauser
pub fn grant_pauser(ctx: Context<Admin>, pauser: Pubkey) -> Result<()> {
    ctx.accounts.bascule_data.pauser = pauser;
    Ok(())
}

/// Updates the reporter account.
///
/// Requires:
/// - the signer has [Admin] permissions (errors with [BasculeError::ENotAdmin])
///
/// Effects:
/// - sets [BasculeData::reporter] to `reporter`, overwriting the previous reporter
pub fn grant_reporter(ctx: Context<Admin>, reporter: Pubkey) -> Result<()> {
    ctx.accounts.bascule_data.deposit_reporter = reporter;
    Ok(())
}

/// Adds a withdrawal validator.
///
/// Requires:
/// - the signer has [Admin] permissions (errors with [BasculeError::ENotAdmin])
///
/// Effects:
/// - adds `validator` to [BasculeData::withdrawal_validators], unless already allowlisted
///
/// Errors
/// - [BasculeError::EMaxValidators] if the max capacity is exceeded
pub fn add_withdrawal_validator(ctx: Context<Admin>, validator: Pubkey) -> Result<()> {
    let allowlist = &mut ctx.accounts.bascule_data.withdrawal_validators;

    // nothing to do if already allowlisted
    if allowlist.contains(&validator) {
        return Ok(());
    }

    // error if the capacity is to be exceeded
    if allowlist.len() == MAX_VALIDATORS {
        return err!(BasculeError::EMaxValidators);
    }

    // insert
    allowlist.push(validator);
    Ok(())
}

/// Removes a validator
///
/// Requires:
/// - the signer has [Admin] permissions (errors with [BasculeError::ENotAdmin])
///
/// Effects:
/// - removes `validator` from [BasculeData::withdrawal_validators], if present
pub fn remove_withdrawal_validator(ctx: Context<Admin>, validator: Pubkey) -> Result<()> {
    let allowlist = &mut ctx.accounts.bascule_data.withdrawal_validators;

    // nothing to do if already allowlisted
    if let Some(idx) = allowlist.iter().position(|v| v == &validator) {
        allowlist.swap_remove(idx);
    }

    Ok(())
}
