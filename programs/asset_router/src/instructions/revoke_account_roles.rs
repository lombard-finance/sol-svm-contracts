use crate::{
    constants,
    errors::AssetRouterError,
    state::{AccountRoles, Config},
};
use anchor_lang::prelude::*;

#[derive(Accounts)]
#[instruction(account: Pubkey)]
pub struct RevokeAccountRoles<'info> {
    #[account(mut, address = config.admin @ AssetRouterError::Unauthorized)]
    pub admin: Signer<'info>,
    #[account(mut, seeds = [constants::CONFIG_SEED], bump)]
    pub config: Account<'info, Config>,
    #[account(
        mut,
        close = admin,
        seeds = [constants::ACCOUNT_ROLES_SEED, account.as_ref()],
        bump
    )]
    pub account_roles: Account<'info, AccountRoles>,

    pub system_program: Program<'info, System>,
}

pub fn revoke_account_roles(_ctx: Context<RevokeAccountRoles>, account: Pubkey) -> Result<()> {
    emit!(crate::events::AccountRolesRevoked { account });
    Ok(())
}
