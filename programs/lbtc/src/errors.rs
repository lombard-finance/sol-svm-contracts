//! Errors in the Lombard protocol.
use anchor_lang::prelude::*;

#[error_code]
pub enum LBTCError {
    #[msg("Unauthorized function call")]
    Unauthorized,
    #[msg("Mismatch between mint payload and passed account")]
    RecipientMismatch,
    #[msg("Invalid treasury provided for redeem")]
    InvalidTreasury,
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
    #[msg("Signatures array length mismatch with validators array")]
    SignatureLengthMismatch,
    #[msg("Script pubkey is unsupported")]
    UnsupportedRedeemAddress,
    #[msg("Redeemed amount is below the BTC dust limit")]
    AmountBelowDustLimit,
    #[msg("Not enough valid signatures")]
    NotEnoughSignatures,
    #[msg("Fee signature invalid")]
    InvalidFeeSignature,
    #[msg("Error when attempting to recover Secp256k1 public key")]
    Secp256k1RecoverError,
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
}
