//! Admin instructions (may be performed by the 'admin' account only)

use anchor_lang::prelude::*;

use crate::{
    errors::BasculeError,
    events::AdminTransferAccepted,
    state::{BasculeData, BASCULE_SEED},
};

/// Account constraints for the instructions that require 'pending_admin' permissions.
#[derive(Accounts)]
pub struct PendingAdmin<'info> {
    /// The system account paying for this instruction
    /// ASSERT:
    /// - the account address equals to 'bascule_data.pending_admin'
    #[account(address = bascule_data.pending_admin @ BasculeError::ENotPendingAdmin)]
    pending_admin: Signer<'info>,

    /// The program state
    #[account(mut, seeds = [BASCULE_SEED], bump = bascule_data.bump)]
    bascule_data: Account<'info, BasculeData>,
}

/// Completes the admin transfer process by accepting the 'admin' role.
///
/// Requires:
/// - the signer has [PendingAdmin] permissions (errors with [BasculeError::ENotPendingAdmin])
///
/// Effects:
/// - sets [BasculeData::admin] to the current transaction payer (which must be the current [BasculeData::pending_admin])
/// - sets [BasculeData::pending_admin] to [Pubkey::default()]
///
/// Emits:
/// - [AdminTransferAccepted]
pub fn transfer_admin_accept(ctx: Context<PendingAdmin>) -> Result<()> {
    ctx.accounts.bascule_data.admin = ctx.accounts.pending_admin.key();
    ctx.accounts.bascule_data.pending_admin = Pubkey::default();
    emit!(AdminTransferAccepted {
        new_admin: ctx.accounts.pending_admin.key()
    });
    Ok(())
}
