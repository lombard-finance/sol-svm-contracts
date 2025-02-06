use anchor_lang::prelude::*;

#[error_code]
pub enum LBTCError {
    #[msg("Unauthorized function call")]
    Unauthorized,
    #[msg("Signatures for payload are invalid")]
    SignaturesInvalid,
    #[msg("Mismatch between mint payload and passed account")]
    RecipientMismatch,
    #[msg("Mint payload already used")]
    MintPayloadUsed,
    #[msg("Passed mint payload hash does not match computed hash")]
    MintPayloadHashMismatch,
    #[msg("Withdrawals are disabled")]
    WithdrawalsDisabled,
    #[msg("Fee is greater than or equal to amount")]
    FeeGTEAmount,
    #[msg("Fee approval expired")]
    FeeApprovalExpired,
    #[msg("Fee signature invalid")]
    InvalidFeeSignature,
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
