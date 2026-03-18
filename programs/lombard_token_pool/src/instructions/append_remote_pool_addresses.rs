use anchor_lang::prelude::*;

use base_token_pool::common::*;

use crate::{
    constants::*,
    state::{ChainConfig, State}
};

#[derive(Accounts)]
#[instruction(remote_chain_selector: u64, mint: Pubkey, addresses: Vec<RemoteAddress>)]
pub struct AppendRemotePoolAddresses<'info> {
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
        realloc = ANCHOR_DISCRIMINATOR + ChainConfig::INIT_SPACE
            + chain_config.base.remote.pool_addresses.iter().map(RemoteAddress::space).sum::<usize>()
            + addresses.iter().map(RemoteAddress::space).sum::<usize>(),
        realloc::payer = authority,
        realloc::zero = false
    )]
    pub chain_config: Account<'info, ChainConfig>,

    #[account(mut, address = state.config.owner)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}

pub fn append_remote_pool_addresses(
    ctx: Context<AppendRemotePoolAddresses>,
    remote_chain_selector: u64,
    _mint: Pubkey,
    addresses: Vec<RemoteAddress>,
) -> Result<()> {
    ctx.accounts.chain_config.base.append_remote_pool_addresses(
        remote_chain_selector,
        _mint,
        addresses,
    )
}
