use anchor_lang::prelude::*;
use base_token_pool::rate_limiter::RateLimitConfig;

use crate::{
    constants::{CONFIG_SEED, REMOTE_TOKEN_CONFIG_SEED},
    errors::BridgeError,
    events::BridgeRateLimitConfigured,
    state::{Config, RemoteTokenConfig},
};

#[derive(Accounts)]
#[instruction(mint: Pubkey, chain_id: [u8; 32])]
pub struct SetRateLimit<'info> {
    #[account(mut, address = config.admin @ BridgeError::Unauthorized)]
    pub admin: Signer<'info>,
    #[account(mut, seeds = [CONFIG_SEED], bump)]
    pub config: Account<'info, Config>,
    #[account(
        mut,
        seeds = [REMOTE_TOKEN_CONFIG_SEED, &mint.to_bytes(), &chain_id],
        bump
    )]
    pub remote_token_config: Account<'info, RemoteTokenConfig>,
    pub system_program: Program<'info, System>,
}

pub fn set_rate_limit(
    ctx: Context<SetRateLimit>,
    mint: Pubkey,
    chain_id: [u8; 32],
    inbound_rate_limit: RateLimitConfig,
) -> Result<()> {
    ctx.accounts.remote_token_config.inbound_rate_limit.set_token_bucket_config(inbound_rate_limit.clone())?;
    emit!(BridgeRateLimitConfigured {
        mint,
        chain_id,
        inbound_rate_limit,
    });
    Ok(())
}
