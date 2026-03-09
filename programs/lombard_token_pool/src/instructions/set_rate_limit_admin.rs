use anchor_lang::prelude::*;

use base_token_pool::common::*;

use crate::{
    constants::*,
    state::State
};

#[derive(Accounts)]
#[instruction(mint: Pubkey)]
pub struct SetRateLimitAdmin<'info> {
    #[account(
        mut,
        seeds = [POOL_STATE_SEED, mint.key().as_ref()],
        bump,
        constraint = valid_version(state.version, MAX_POOL_STATE_V) @ CcipTokenPoolError::InvalidVersion,
    )]
    pub state: Account<'info, State>,
    #[account(mut, address = state.config.owner @ CcipTokenPoolError::Unauthorized)]
    pub authority: Signer<'info>,
}

pub fn set_rate_limit_admin(
    ctx: Context<SetRateLimitAdmin>,
    _mint: Pubkey,
    new_rate_limit_admin: Pubkey,
) -> Result<()> {
    ctx.accounts
        .state
        .config
        .set_rate_limit_admin(new_rate_limit_admin)
}
