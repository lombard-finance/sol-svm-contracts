use anchor_lang::prelude::*;

use anchor_spl::token_interface::{Mint};

use base_token_pool::common::*;

use crate::{
    constants::*,
    state::State
};

#[derive(Accounts)]
#[instruction(remove: Vec<Pubkey>)]
pub struct RemoveFromAllowlist<'info> {
    #[account(
        mut,
        seeds = [
            POOL_STATE_SEED,
            mint.key().as_ref()
        ],
        bump,
        constraint = valid_version(state.version, MAX_POOL_STATE_V) @ CcipTokenPoolError::InvalidVersion,
        realloc = ANCHOR_DISCRIMINATOR + State::INIT_SPACE + 32 * (state.config.allow_list.len().saturating_sub(remove.len())),
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

pub fn remove_from_allow_list(
    ctx: Context<RemoveFromAllowlist>,
    remove: Vec<Pubkey>,
) -> Result<()> {
    let list = &mut ctx.accounts.state.config.allow_list;
    // Cache initial length
    let initial_list_len = list.len();
    // Collect all keys to remove into a HashSet for O(1) lookups
    let keys_to_remove: std::collections::HashSet<Pubkey> = remove.into_iter().collect();
    // Perform a single pass through the list
    list.retain(|k| !keys_to_remove.contains(k));

    // We don't store repeated keys, so the keys_to_remove should match the removed keys
    require_eq!(
        initial_list_len,
        list.len().checked_add(keys_to_remove.len()).unwrap(),
        CcipTokenPoolError::AllowlistKeyDidNotExist
    );

    Ok(())
}
