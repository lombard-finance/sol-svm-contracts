//! Set the mint fee for the asset router by an operator watching to update fees based on network/market conditions.
use crate::{
    constants::{self, ACCOUNT_ROLES_SEED},
    errors::AssetRouterError,
    events::MintFeeSet,
    state::{AccountRole, AccountRoles, TokenConfig},
};
use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct SetMintFee<'info> {
    pub operator: Signer<'info>,
    #[account(
        mut,
        constraint = account_roles.has_role(AccountRole::Operator) @ AssetRouterError::Unauthorized,
        seeds = [ACCOUNT_ROLES_SEED, operator.key().as_ref()],
        bump
    )]
    pub account_roles: Account<'info, AccountRoles>,
    #[account(mut)]
    pub token_config: Account<'info, TokenConfig>,
}

pub fn set_mint_fee(ctx: Context<SetMintFee>, mint_fee: u64) -> Result<()> {
    require!(mint_fee <= constants::MAX_FEE, AssetRouterError::FeeTooHigh);
    ctx.accounts.token_config.max_mint_commission = mint_fee;
    emit!(MintFeeSet { mint_fee });
    Ok(())
}
