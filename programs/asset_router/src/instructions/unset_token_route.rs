//! Unset a token route. All params are required to avoid confusion and provide better clarity.

use crate::{
    constants,
    errors::AssetRouterError,
    state::{Config, TokenRoute},
};
use anchor_lang::prelude::*;

#[derive(Accounts)]
#[instruction(from_chain_id: [u8; 32], from_token_address: [u8; 32], to_chain_id: [u8; 32], to_token_address: [u8; 32])]
pub struct UnsetTokenRoute<'info> {
    #[account(mut, address = config.admin @ AssetRouterError::Unauthorized)]
    pub payer: Signer<'info>,
    #[account(mut, seeds = [constants::CONFIG_SEED], bump)]
    pub config: Account<'info, Config>,
    #[account(
        mut,
        close = payer,
        seeds = [constants::TOKEN_ROUTE_SEED, &from_chain_id, &from_token_address, &to_chain_id, &to_token_address],
        bump
    )]
    pub token_route: Account<'info, TokenRoute>,
    pub system_program: Program<'info, System>,
}

pub fn unset_token_route(
    ctx: Context<UnsetTokenRoute>,
    from_chain_id: [u8; 32],
    from_token_address: [u8; 32],
    to_chain_id: [u8; 32],
    to_token_address: [u8; 32],
) -> Result<()> {
    emit!(crate::events::TokenRouteUnset {
        from_chain_id,
        from_token_address,
        to_chain_id,
        to_token_address,
        token_route_type: ctx.accounts.token_route.route_type
    });
    Ok(())
}
