//! Pauses the program.
use crate::{
    constants::{ACCOUNT_ROLES_SEED, CONFIG_SEED},
    errors::AssetRouterError,
    events::ProgramPaused,
    state::{AccountRole, AccountRoles, Config},
};
use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct Pause<'info> {
    pub payer: Signer<'info>,
    #[account(
        mut,
        constraint = !config.paused @ AssetRouterError::Paused,
        seeds = [CONFIG_SEED],
        bump,
    )]
    pub config: Account<'info, Config>,
    #[account(
        mut,
        constraint = account_roles.has_role(AccountRole::Pauser) @ AssetRouterError::Unauthorized,
        seeds = [ACCOUNT_ROLES_SEED, payer.key().as_ref()],
        bump
    )]
    pub account_roles: Account<'info, AccountRoles>,
}

pub fn pause(ctx: Context<Pause>) -> Result<()> {
    ctx.accounts.config.paused = true;
    emit!(ProgramPaused { paused: true });
    Ok(())
}
