use anchor_lang::prelude::*;

use base_token_pool::common::*;

// NOTE: accounts derivations must be native to program - will cause ownership check issues if imported
// wraps functionality from shared Config and Chain types
#[account]
#[derive(InitSpace)]
pub struct State {
    pub version: u8,
    pub config: BaseConfig,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, InitSpace, Debug)]
pub struct LombardChain {
    pub destination_chain_id: [u8; 32],
    pub destination_caller: [u8; 32],
}

#[account]
#[derive(InitSpace)]
pub struct PoolConfig {
    // This is mainly a placeholder in case we ever want to include global configs that apply
    // to how all pools behave.
    // For now, it is pretty much empty.
    pub version: u8,
}

#[account]
#[derive(InitSpace)]
pub struct ChainConfig {
    pub version: u8,
    pub base: BaseChain,
    pub bridge: LombardChain,
}
