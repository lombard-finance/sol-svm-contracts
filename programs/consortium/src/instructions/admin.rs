//! Collection of admin-privileged functionality.
use crate::{
    constants, errors::ConsortiumError, events::OwnershipTransferInitiated, state::Config,
};
use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct Admin<'info> {
    #[account(address = config.admin @ ConsortiumError::Unauthorized)]
    pub payer: Signer<'info>,
    #[account(mut, seeds = [constants::CONFIG_SEED], bump)]
    pub config: Account<'info, Config>,
}

pub fn transfer_ownership(ctx: Context<Admin>, new_admin: Pubkey) -> Result<()> {
    ctx.accounts.config.pending_admin = new_admin;
    emit!(OwnershipTransferInitiated { new_admin });
    Ok(())
}
