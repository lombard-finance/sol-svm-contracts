use anchor_lang::prelude::*;

use crate::constants::{ACCOUNT_ROLES_SEED, CONFIG_SEED};
use crate::errors::BasculeGmpError;
use crate::events::ValidateThresholdUpdated;
use crate::state::{AccountRole, AccountRoles, Config};

#[derive(Accounts)]
pub struct UpdateValidateThreshold<'info> {
    pub guardian: Signer<'info>,
    #[account(
        mut,
        seeds = [CONFIG_SEED],
        bump
    )]
    pub config: Account<'info, Config>,
    #[account(
        constraint = account_roles.has_role(AccountRole::ValidationGuardian) @ BasculeGmpError::Unauthorized,
        seeds = [ACCOUNT_ROLES_SEED, guardian.key().as_ref()],
        bump
    )]
    pub account_roles: Account<'info, AccountRoles>,
}

pub fn update_validate_threshold(
    ctx: Context<UpdateValidateThreshold>,
    new_threshold: u64,
) -> Result<()> {
    ctx.accounts.config.validate_threshold = new_threshold;
    emit!(ValidateThresholdUpdated {
        new_threshold,
    });
    Ok(())
}
