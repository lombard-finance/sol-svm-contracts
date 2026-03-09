use anchor_lang::prelude::*;
use anchor_lang::solana_program::hash::hash as sha256;

use crate::{
    constants,
    errors::RatioOracleError,
    state::{Config, Oracle},
    utils::ratio_threshold::validate_ratio_threshold,
};

#[derive(Accounts)]
#[instruction(denom: String)]
pub struct InitializeOracle<'info> {
    #[account(mut, address = config.admin @ RatioOracleError::Unauthorized)]
    pub payer: Signer<'info>,
    #[account(seeds = [constants::CONFIG_SEED], bump)]
    pub config: Account<'info, Config>,
    #[account(
        init,
        seeds = [constants::ORACLE_SEED, &sha256(denom.as_bytes()).to_bytes()[..]],
        bump,
        payer = payer,
        space = 8 + Oracle::size(denom.len())
    )]
    pub oracle: Account<'info, Oracle>,

    pub system_program: Program<'info, System>,
}

pub fn initialize_oracle(
    ctx: Context<InitializeOracle>,
    denom: String,
    mint_address: Pubkey,
    initial_ratio: u128,
    switch_time: u64,
    max_ahead_interval: u64,
    ratio_threshold: u128,
) -> Result<()> {
    require!(denom.len() > 0, RatioOracleError::EmptyDenom);

    ctx.accounts.oracle.denom = denom;
    ctx.accounts.oracle.mint_address = mint_address;
    ctx.accounts.oracle.previous_ratio = None;
    ctx.accounts.oracle.current_ratio = initial_ratio;
    ctx.accounts.oracle.switch_time = switch_time;
    ctx.accounts.oracle.max_ahead_interval = max_ahead_interval;

    validate_ratio_threshold(ratio_threshold)?;

    ctx.accounts.oracle.ratio_threshold = ratio_threshold;
    Ok(())
}
