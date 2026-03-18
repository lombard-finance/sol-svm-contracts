use anchor_lang::prelude::*;

use base_token_pool::common::*;

use crate::{
    constants::*,
    state::{ChainConfig, LombardChain, State},
    events::RemoteChainLombardConfigChanged
};

#[derive(Accounts)]
#[instruction(remote_chain_selector: u64, mint: Pubkey, cfg: RemoteConfig)]
pub struct EditChainConfigDynamicSize<'info> {
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
        realloc = ANCHOR_DISCRIMINATOR + ChainConfig::INIT_SPACE + cfg.pool_addresses.iter().map(RemoteAddress::space).sum::<usize>(),
        realloc::payer = authority,
        realloc::zero = false
    )]
    pub chain_config: Account<'info, ChainConfig>,

    #[account(mut, address = state.config.owner)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}

pub fn edit_chain_remote_config(
    ctx: Context<EditChainConfigDynamicSize>,
    remote_chain_selector: u64,
    mint: Pubkey,
    cfg: RemoteConfig,
) -> Result<()> {
    ctx.accounts
        .chain_config
        .base
        .set(remote_chain_selector, mint, cfg)
}

#[derive(Accounts)]
#[instruction(remote_chain_selector: u64, mint: Pubkey)]
pub struct EditChainConfig<'info> {
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

    #[account(mut, constraint = authority.key() == state.config.owner @ CcipTokenPoolError::Unauthorized)]
    pub authority: Signer<'info>,
}

pub fn edit_chain_remote_config_lombard(
    ctx: Context<EditChainConfig>,
    _remote_chain_selector: u64,
    _mint: Pubkey,
    cfg: LombardChain,
) -> Result<()> {
    ctx.accounts.chain_config.bridge = cfg;
    emit!(RemoteChainLombardConfigChanged {
        config: ctx.accounts.chain_config.bridge
    });
    Ok(())
}
