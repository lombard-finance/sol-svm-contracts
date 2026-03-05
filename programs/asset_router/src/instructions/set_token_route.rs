use crate::{
    constants::{self, CHAIN_ID},
    errors::AssetRouterError,
    state::{Config, TokenRoute, TokenRouteType},
};
use anchor_lang::prelude::*;

#[derive(Accounts)]
#[instruction(from_chain_id: [u8; 32], from_token_address: [u8; 32], to_chain_id: [u8; 32], to_token_address: [u8; 32])]
pub struct SetTokenRoute<'info> {
    #[account(mut, address = config.admin @ AssetRouterError::Unauthorized)]
    pub payer: Signer<'info>,
    #[account(mut, seeds = [constants::CONFIG_SEED], bump)]
    pub config: Account<'info, Config>,
    #[account(
        init,
        seeds = [
            constants::TOKEN_ROUTE_SEED,
            &from_chain_id,
            &from_token_address,
            &to_chain_id,
            &to_token_address
        ],
        bump,
        payer = payer,
        space = 8 + TokenRoute::INIT_SPACE
    )]
    pub token_route: Account<'info, TokenRoute>,
    pub system_program: Program<'info, System>,
}

pub fn set_token_route(
    ctx: Context<SetTokenRoute>,
    from_chain_id: [u8; 32],
    from_token_address: [u8; 32],
    to_chain_id: [u8; 32],
    to_token_address: [u8; 32],
    token_route_type: TokenRouteType,
) -> Result<()> {
    require!(
        from_chain_id == CHAIN_ID || to_chain_id == CHAIN_ID,
        AssetRouterError::InvalidChainID
    );

    ctx.accounts.token_route.route_type = token_route_type.clone();
    emit!(crate::events::TokenRouteSet {
        from_chain_id,
        from_token_address,
        to_chain_id,
        to_token_address,
        token_route_type
    });
    Ok(())
}
