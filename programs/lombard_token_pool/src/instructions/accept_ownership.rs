//! Functionality to accept an ownership transfer.

use anchor_lang::prelude::*;

use anchor_spl::token_interface::{Mint};

use base_token_pool::common::*;

use crate::{
    constants::MAX_POOL_STATE_V,
    state::State
};

#[derive(Accounts)]
pub struct AcceptOwnership<'info> {
    #[account(
        mut,
        seeds = [
            POOL_STATE_SEED,
            mint.key().as_ref()
        ],
        bump,
        constraint = valid_version(state.version, MAX_POOL_STATE_V) @ CcipTokenPoolError::InvalidVersion,
    )]
    pub state: Account<'info, State>,

    pub mint: InterfaceAccount<'info, Mint>, // underlying token that the pool wraps

    #[account(address = state.config.proposed_owner @ CcipTokenPoolError::Unauthorized)]
    pub authority: Signer<'info>,
}

pub fn accept_ownership(ctx: Context<AcceptOwnership>) -> Result<()> {
    ctx.accounts.state.config.accept_ownership()
}
