use anchor_lang::prelude::*;

#[error_code]
pub enum LBTCError {
    #[msg("Invalid action bytes")]
    InvalidActionBytes,
    #[msg("Invalid chain ID")]
    InvalidChainID,
    #[msg("Amount too large")]
    AmountTooLarge,
    #[msg("Vout too large")]
    VoutTooLarge,
    #[msg("Could not convert amount bytes to u64")]
    CouldNotConvertToU64,
    #[msg("Could not convert vout bytes to u32")]
    CouldNotConvertToU32,
    #[msg("Leftover data in payload")]
    LeftoverData,
}
