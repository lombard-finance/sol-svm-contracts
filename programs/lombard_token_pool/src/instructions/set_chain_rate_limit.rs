use anchor_lang::prelude::*;

use base_token_pool::common::*;
use base_token_pool::rate_limiter::*;

use crate::{
    constants::*,
    state::{ChainConfig, State}
};

#[derive(Accounts)]
#[instruction(remote_chain_selector: u64, mint: Pubkey)]
pub struct SetChainRateLimit<'info> {
    #[account(
        seeds = [
            POOL_STATE_SEED,
            mint.key().as_ref()
        ],
        bump,
        constraint = valid_version(state.version, MAX_POOL_STATE_V) @ CcipTokenPoolError::InvalidVersion,
    )]
    pub state: Account<'info, State>,

    #[account(
        mut,
        seeds = [
            POOL_CHAINCONFIG_SEED,
            &remote_chain_selector.to_le_bytes(),
            mint.key().as_ref(),
        ],
        bump,
        constraint = valid_version(chain_config.version, MAX_POOL_CHAIN_CONFIG_V) @ CcipTokenPoolError::InvalidVersion,
    )]
    pub chain_config: Account<'info, ChainConfig>,

    #[account(mut, constraint = authority.key() == state.config.owner || authority.key() == state.config.rate_limit_admin @ CcipTokenPoolError::Unauthorized)]
    pub authority: Signer<'info>,
}

pub fn set_chain_rate_limit(
    ctx: Context<SetChainRateLimit>,
    remote_chain_selector: u64,
    mint: Pubkey,
    inbound: RateLimitConfig,
    outbound: RateLimitConfig,
) -> Result<()> {
    ctx.accounts.chain_config.base.set_chain_rate_limit(
        remote_chain_selector,
        mint,
        inbound,
        outbound,
    )
}
