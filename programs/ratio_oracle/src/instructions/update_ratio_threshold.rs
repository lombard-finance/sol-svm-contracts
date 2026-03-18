use anchor_lang::prelude::*;

use crate::{
    constants,
    errors::RatioOracleError,
    state::{Config, Oracle},
    utils::ratio_threshold::validate_ratio_threshold,
};

#[derive(Accounts)]
pub struct UpdateRatioThreshold<'info> {
    #[account(address = config.admin @ RatioOracleError::Unauthorized)]
    pub payer: Signer<'info>,
    #[account(mut, seeds = [constants::CONFIG_SEED], bump)]
    pub config: Account<'info, Config>,
    #[account(mut)]
    pub oracle: Account<'info, Oracle>,
}

pub fn update_ratio_threshold(
    ctx: Context<UpdateRatioThreshold>,
    ratio_threshold: u128,
) -> Result<()> {
    validate_ratio_threshold(ratio_threshold)?;
    ctx.accounts.oracle.ratio_threshold = ratio_threshold;
    Ok(())
}
