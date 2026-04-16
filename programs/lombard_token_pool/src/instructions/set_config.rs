use anchor_lang::prelude::*;

use anchor_spl::token_interface::{Mint};

use base_token_pool::common::*;

use crate::{
    constants::*, events::AltEnabled, state::State
};

#[derive(Accounts)]
pub struct SetConfig<'info> {
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

    #[account(constraint = state.config.owner == authority.key() @ CcipTokenPoolError::Unauthorized)]
    pub authority: Signer<'info>,
}


pub fn set_alt(ctx: Context<SetConfig>, alt: Option<Pubkey>) -> Result<()> {
    ctx.accounts.state.config.alt = alt;
    emit!(AltEnabled { enabled: alt.is_some() });
    Ok(())
}
