//! Functionality to accept an ownership transfer.
use crate::{constants, events::OwnershipTransferred, state::Config};
use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct AcceptOwnership<'info> {
    #[account(address = config.pending_admin)]
    pub payer: Signer<'info>,
    #[account(mut, seeds = [constants::CONFIG_SEED], bump)]
    pub config: Account<'info, Config>,
}

pub fn accept_ownership(ctx: Context<AcceptOwnership>) -> Result<()> {
    ctx.accounts.config.admin = ctx.accounts.payer.key();
    ctx.accounts.config.pending_admin = Pubkey::default();
    emit!(OwnershipTransferred {
        new_admin: ctx.accounts.payer.key()
    });
    Ok(())
}
