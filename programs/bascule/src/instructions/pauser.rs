//! Pauser instructions (may be performed by the 'pauser' account only)

use anchor_lang::prelude::*;

use crate::{
    errors::BasculeError,
    state::{BasculeData, BASCULE_SEED},
};

/// Account constraints for the instructions that require 'pauser' permissions.
#[derive(Accounts)]
pub struct Pauser<'info> {
    /// The system account paying for this instruction
    /// ASSERT:
    /// - the account address equals to 'bascule_data.pauser'
    #[account(address = bascule_data.pauser @ BasculeError::ENotPauser)]
    pauser: Signer<'info>,

    /// The program state
    #[account(mut, seeds = [BASCULE_SEED], bump = bascule_data.bump)]
    bascule_data: Account<'info, BasculeData>,
}

/// Pauses the program
///
/// Requires:
/// - the signer has [Pauser] permissions (errors with [BasculeError::ENotPauser])
///
/// Effects:
/// - sets [BasculeData::is_paused] to true
pub fn pause(ctx: Context<Pauser>) -> Result<()> {
    ctx.accounts.bascule_data.is_paused = true;
    Ok(())
}

/// Unpauses the program
///
/// Requires:
/// - [Pauser] permissions (errors with [BasculeError::ENotPauser])
///
/// Effects:
/// - sets [BasculeData::is_paused] to false
pub fn unpause(ctx: Context<Pauser>) -> Result<()> {
    ctx.accounts.bascule_data.is_paused = false;
    Ok(())
}
