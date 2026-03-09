use anchor_lang::prelude::*;

use anchor_spl::token_interface::{Mint};

use base_token_pool::common::*;

use crate::{
    constants::MAX_POOL_STATE_V,
    program::LombardTokenPool,
    state::State
};


#[derive(Accounts)]
pub struct AdminUpdateTokenPool<'info> {
    #[account(
        seeds = [POOL_STATE_SEED, mint.key().as_ref()],
        bump,
        constraint = valid_version(state.version, MAX_POOL_STATE_V) @ CcipTokenPoolError::InvalidVersion,
    )]
    pub state: Account<'info, State>, // config PDA for token pool
    pub mint: InterfaceAccount<'info, Mint>, // underlying token that the pool wraps

    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(constraint = program.programdata_address()? == Some(program_data.key()))]
    pub program: Program<'info, LombardTokenPool>,

    // The upgrade authority of the token pool program can update certain values of their token pools only
    // (router and rmn addresses, for testing)
    // This is consistent with the BurnmintTokenPool program, although it is expected that this pool will always
    // be owned by the upgrade authority of the token pool program.
    #[account(constraint = allowed_admin_modify_token_pool(&program_data, &authority, &state) @ CcipTokenPoolError::Unauthorized)]
    pub program_data: Account<'info, ProgramData>,
}

pub fn set_router(ctx: Context<AdminUpdateTokenPool>, new_router: Pubkey) -> Result<()> {
    ctx.accounts
        .state
        .config
        .set_router(new_router, ctx.program_id)
}

pub fn set_rmn(ctx: Context<AdminUpdateTokenPool>, rmn_address: Pubkey) -> Result<()> {
    ctx.accounts.state.config.set_rmn(rmn_address)
}

/// Checks that the authority and the token pool owner are the upgrade authority
fn allowed_admin_modify_token_pool(
    program_data: &Account<ProgramData>,
    authority: &Signer,
    state: &Account<State>,
) -> bool {
    program_data.upgrade_authority_address == Some(authority.key()) && // Only the upgrade authority of the token pool program can modify certain values of a given token pool
    state.config.owner == authority.key() // if only if the token pool is owned by the upgrade authority
}
