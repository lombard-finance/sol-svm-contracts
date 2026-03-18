//! Errors in the Lombard protocol.
use anchor_lang::prelude::*;

#[error_code]
pub enum RatioOracleError {
    #[msg("Unauthorized function call")]
    Unauthorized,
    #[msg("Buffer IO error")]
    BufferIOError,
    #[msg("Invalid payload length")]
    InvalidPayloadLength,
    #[msg("Invalid payload selector")]
    InvalidPayloadSelector,
    #[msg("Invalid denom hash")]
    WrongDenom,
    #[msg("Outdated ratio update")]
    OutdatedRatioUpdate,
    #[msg("Max ahead interval exceeded")]
    MaxAheadIntervalExceeded,
    #[msg("Ratio threshold exceeded")]
    RatioThresholdExceeded,
    #[msg("Empty denom")]
    EmptyDenom,
    #[msg("Zero ratio threshold")]
    ZeroRatioThreshold,
    #[msg("Exceeded max ratio threshold")]
    ExceededMaxRatioThreshold,
}

impl From<std::io::Error> for RatioOracleError {
    fn from(_error: std::io::Error) -> Self {
        RatioOracleError::BufferIOError
    }
}
