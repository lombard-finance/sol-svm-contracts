use anchor_lang::prelude::*;

use crate::constants::CONFIG_SEED;
use crate::errors::BasculeGmpError;
use crate::events::{OwnershipTransferInitiated, ProgramPaused};
use crate::state::Config;

#[derive(Accounts)]
pub struct Admin<'info> {
    #[account(address = config.admin @ BasculeGmpError::Unauthorized)]
    pub admin: Signer<'info>,
    #[account(mut, seeds = [CONFIG_SEED], bump)]
    pub config: Account<'info, Config>,
}

pub fn unpause(ctx: Context<Admin>) -> Result<()> {
    ctx.accounts.config.paused = false;
    emit!(ProgramPaused { paused: false });
    Ok(())
}

pub fn transfer_ownership(ctx: Context<Admin>, new_admin: Pubkey) -> Result<()> {
    ctx.accounts.config.pending_admin = new_admin;
    emit!(OwnershipTransferInitiated { new_admin });
    Ok(())
}
