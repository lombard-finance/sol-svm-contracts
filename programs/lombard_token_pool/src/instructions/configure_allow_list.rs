use anchor_lang::prelude::*;

use anchor_spl::token_interface::{Mint};

use base_token_pool::common::*;

use crate::{
    constants::MAX_POOL_STATE_V,
    state::State
};

#[derive(Accounts)]
#[instruction(add: Vec<Pubkey>)]
pub struct AddToAllowList<'info> {
    #[account(
        mut,
        seeds = [
            POOL_STATE_SEED,
            mint.key().as_ref()
        ],
        bump,
        realloc = ANCHOR_DISCRIMINATOR + State::INIT_SPACE + 32 * (state.config.allow_list.len() + add.len()),
        realloc::payer = authority,
        realloc::zero = false,
        constraint = valid_version(state.version, MAX_POOL_STATE_V) @ CcipTokenPoolError::InvalidVersion,
    )]
    pub state: Account<'info, State>,

    pub mint: InterfaceAccount<'info, Mint>, // underlying token that the pool wraps

    #[account(mut, address = state.config.owner @ CcipTokenPoolError::Unauthorized)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}

pub fn configure_allow_list(
    ctx: Context<AddToAllowList>,
    add: Vec<Pubkey>,
    enabled: bool,
) -> Result<()> {
    ctx.accounts.state.config.list_enabled = enabled;
    let list = &mut ctx.accounts.state.config.allow_list;
    for key in add {
        require!(
            !list.contains(&key),
            CcipTokenPoolError::AllowlistKeyAlreadyExisted
        );
        list.push(key);
    }

    Ok(())
}
