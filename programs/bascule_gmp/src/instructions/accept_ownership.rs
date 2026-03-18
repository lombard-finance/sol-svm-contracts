use anchor_lang::prelude::*;

use crate::constants::CONFIG_SEED;
use crate::errors::BasculeGmpError;
use crate::state::Config;

#[derive(Accounts)]
pub struct AcceptOwnership<'info> {
    #[account(
        mut,
        constraint = config.pending_admin == accept_admin.key() @ BasculeGmpError::Unauthorized,
        seeds = [CONFIG_SEED],
        bump
    )]
    pub config: Account<'info, Config>,
    pub accept_admin: Signer<'info>,
}

pub fn accept_ownership(ctx: Context<AcceptOwnership>) -> Result<()> {
    let config = &mut ctx.accounts.config;
    config.admin = config.pending_admin;
    config.pending_admin = Pubkey::default();
    Ok(())
}
