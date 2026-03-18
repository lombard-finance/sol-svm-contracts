use anchor_lang::prelude::*;

use crate::{constants::MAX_RATIO_THRESHOLD, errors::RatioOracleError};

pub fn validate_ratio_threshold(ratio_threshold: u128) -> Result<()> {
    require!(ratio_threshold > 0, RatioOracleError::ZeroRatioThreshold);
    require!(
        ratio_threshold <= MAX_RATIO_THRESHOLD,
        RatioOracleError::ExceededMaxRatioThreshold
    );
    Ok(())
}
