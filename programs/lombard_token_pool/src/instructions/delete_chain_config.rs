use anchor_lang::prelude::*;

use base_token_pool::common::*;

use crate::{
    constants::*,
    state::{ChainConfig, State}
};

#[derive(Accounts)]
#[instruction(remote_chain_selector: u64, mint: Pubkey)]
pub struct DeleteChainConfig<'info> {
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
        close = authority,
    )]
    pub chain_config: Account<'info, ChainConfig>,

    #[account(mut, address = state.config.owner)]
    pub authority: Signer<'info>,
}

pub fn delete_chain_config(
    _ctx: Context<DeleteChainConfig>,
    remote_chain_selector: u64,
    mint: Pubkey,
) -> Result<()> {
    emit!(RemoteChainRemoved {
        chain_selector: remote_chain_selector,
        mint
    });
    Ok(())
}