use anchor_lang::prelude::*;
use crate::{
    constants::{ACCOUNT_ROLES_SEED, CONFIG_SEED},
    errors::{BridgeError},
    events::ProgramPaused,
    state::{AccountRole, AccountRoles, Config},
};

#[derive(Accounts)]
pub struct Pause<'info> {
    pub pauser: Signer<'info>,
    #[account(
        mut,
        seeds = [CONFIG_SEED],
        constraint = !config.paused @ BridgeError::Paused, 
        bump
    )]
    pub config: Account<'info, Config>,
    #[account(
        mut,
        constraint = account_roles.has_role(AccountRole::Pauser) @ BridgeError::Unauthorized,
        seeds = [ACCOUNT_ROLES_SEED, pauser.key().as_ref()],
        bump
    )]
    pub account_roles: Account<'info, AccountRoles>,
}

pub fn pause(ctx: Context<Pause>) -> Result<()> {
    ctx.accounts.config.paused = true;
    emit!(ProgramPaused { paused: true });
    Ok(())
}
