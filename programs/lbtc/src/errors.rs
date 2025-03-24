//! Errors in the Lombard protocol.
use anchor_lang::prelude::*;

#[error_code]
pub enum LBTCError {
    #[msg("Unauthorized function call")]
    Unauthorized,
    #[msg("Mismatch between mint payload and passed account")]
    RecipientMismatch,
    #[msg("Mint payload already used")]
    MintPayloadUsed,
    #[msg("Passed mint payload hash does not match computed hash")]
    MintPayloadHashMismatch,
    #[msg("Passed valset payload hash does not match computed hash")]
    ValsetPayloadHashMismatch,
    #[msg("Withdrawals are disabled")]
    WithdrawalsDisabled,
    #[msg("Fee is greater than or equal to amount")]
    FeeGTEAmount,
    #[msg("Fee approval expired")]
    FeeApprovalExpired,
    #[msg("Script pubkey is unsupported")]
    UnsupportedRedeemAddress,
    #[msg("Redeemed amount is below the BTC dust limit")]
    AmountBelowDustLimit,
    #[msg("Not enough valid signatures")]
    NotEnoughSignatures,
    #[msg("Fee signature invalid")]
    InvalidFeeSignature,
    #[msg("Invalid action bytes")]
    InvalidActionBytes,
    #[msg("Invalid chain ID")]
    InvalidChainID,
    #[msg("Attempted to decode a u64, but leftover too large")]
    U64TooLarge,
    #[msg("Attempted to decode a u32, but leftover too large")]
    U32TooLarge,
    #[msg("Could not convert amount bytes to u64")]
    CouldNotConvertToU64,
    #[msg("Could not convert vout bytes to u32")]
    CouldNotConvertToU32,
    #[msg("Leftover data in payload")]
    LeftoverData,
    #[msg("Validator set already set")]
    ValidatorSetAlreadySet,
    #[msg("Invalid epoch")]
    InvalidEpoch,
    #[msg("No validator set exists")]
    NoValidatorSet,
    #[msg("Invalid validator set size")]
    InvalidValidatorSetSize,
    #[msg("Invalid weight threshold")]
    InvalidWeightThreshold,
    #[msg("Mismatch between validators length and weights length")]
    ValidatorsAndWeightsMismatch,
    #[msg("Weight for validator is zero")]
    ZeroWeight,
    #[msg("Sum of weights is below the threshold")]
    WeightsBelowThreshold,
    #[msg("LBTC contract is paused")]
    Paused,
    #[msg("LBTC contract is not paused")]
    NotPaused,
    #[msg("Invalid verifying contract")]
    InvalidVerifyingcontract,
    #[msg("Mismatch between signatures and indices length")]
    SignaturesIndicesMismatch,
    #[msg("Selected fee is too high")]
    FeeTooHigh,
    #[msg("Claimer already exists")]
    ClaimerExists,
    #[msg("Pauser already exists")]
    PauserExists,
    #[msg("Claimer not found")]
    ClaimerNotFound,
    #[msg("Pauser not found")]
    PauserNotFound,
}
