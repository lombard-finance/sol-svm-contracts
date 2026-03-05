use anchor_lang::prelude::*;

use crate::constants::{ACCOUNT_ROLES_SEED, CONFIG_SEED};
use crate::errors::MailboxError;
use crate::state::{AccountRole, AccountRoles, Config};

#[derive(Accounts)]
pub struct Pause<'info> {
    pub pauser: Signer<'info>,

    #[account(
        mut,
        seeds = [CONFIG_SEED],
        constraint = !config.paused @ MailboxError::Paused,
        bump
    )]
    pub config: Account<'info, Config>,

    #[account(
        constraint = account_roles.has_role(AccountRole::Pauser) @ MailboxError::Unauthorized,
        seeds = [ACCOUNT_ROLES_SEED, pauser.key().as_ref()],
        bump
    )]
    pub account_roles: Account<'info, AccountRoles>,
}

pub fn pause(ctx: Context<Pause>) -> Result<()> {
    let config = &mut ctx.accounts.config;

    config.paused = true;

    emit!(crate::events::ProgramPaused { paused: true });

    Ok(())
}
