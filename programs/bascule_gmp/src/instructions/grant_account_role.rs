use anchor_lang::prelude::*;

use crate::{
    constants,
    errors::BasculeGmpError,
    state::{AccountRole, AccountRoles, Config},
};

#[derive(Accounts)]
#[instruction(account: Pubkey, account_role: AccountRole)]
pub struct GrantAccountRole<'info> {
    #[account(mut, address = config.admin @ BasculeGmpError::Unauthorized)]
    pub admin: Signer<'info>,
    #[account(seeds = [constants::CONFIG_SEED], bump)]
    pub config: Account<'info, Config>,
    #[account(
        init_if_needed,
        payer = admin,
        space = 8 + AccountRoles::INIT_SPACE,
        constraint = !account_roles.has_role(account_role) @ BasculeGmpError::AccountRoleAlreadyGranted,
        seeds = [constants::ACCOUNT_ROLES_SEED, account.as_ref()],
        bump
    )]
    pub account_roles: Account<'info, AccountRoles>,
    pub system_program: Program<'info, System>,
}

pub fn grant_account_role(
    ctx: Context<GrantAccountRole>,
    account: Pubkey,
    account_role: AccountRole,
) -> Result<()> {
    ctx.accounts.account_roles.add_role(account_role);
    emit!(crate::events::AccountRoleGranted {
        account,
        account_role
    });
    Ok(())
}
