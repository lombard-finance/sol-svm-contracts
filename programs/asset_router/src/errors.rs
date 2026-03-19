//! Errors in the Lombard protocol.
use anchor_lang::prelude::*;

#[error_code]
pub enum AssetRouterError {
    #[msg("Unauthorized function call")]
    Unauthorized,
    #[msg("Account role already granted")]
    AccountRoleAlreadyGranted,
    #[msg("Mismatch between mint payload and passed account")]
    RecipientMismatch,
    #[msg("Invalid chain ID")]
    InvalidChainID,
    #[msg("Bascule not available")]
    BasculeNotAvailable,
    #[msg("Invalid token address")]
    InvalidTokenAddress,
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
    #[msg("Script pubkey is unsupported")]
    UnsupportedRedeemAddress,
    #[msg("Redeemed amount is below the BTC dust limit")]
    AmountBelowDustLimit,
    #[msg("Invalid fee action")]
    InvalidFeeAction,
    #[msg("Fee signature invalid")]
    InvalidFeeSignature,
    #[msg("Invalid fee payload length")]
    InvalidFeePayloadLength,
    #[msg("LBTC contract is paused")]
    Paused,
    #[msg("LBTC contract is not paused")]
    NotPaused,
    #[msg("Invalid verifying contract")]
    InvalidVerifyingcontract,
    #[msg("Selected fee is too high")]
    FeeTooHigh,
    #[msg("Invalid payload length")]
    InvalidPayloadLength,
    #[msg("Invalid payload selector")]
    InvalidPayloadSelector,
    #[msg("Buffer IO error")]
    BufferIOError,
    #[msg("Invalid message length")]
    InvalidMessageLength,
    #[msg("Invalid message selector")]
    InvalidMessageSelector,
    #[msg("Invalid message sender")]
    InvalidMessageSender,
    #[msg("Zero amount")]
    ZeroAmount,
    #[msg("Invalid token route type")]
    InvalidTokenRouteType,
    #[msg("Program error")]
    ProgramError,
    #[msg("Treasury token account not found")]
    TreasuryTokenAccountNotFound,
    #[msg("Missing Ed25519 instruction")]
    MissingEd25519Instruction,
    #[msg("Invalid Ed25519 instruction")]
    InvalidEd25519Instruction,
    #[msg("Invalid public key")]
    InvalidPublicKey,
    #[msg("Invalid message")]
    InvalidMessage,
    #[msg("Invalid signature")]
    InvalidSignature,
    #[msg("Missing bascule account")]
    MissingBasculeAccount,
    #[msg("Invalid bascule program")]
    InvalidBasculeProgram,
    #[msg("Invalid bascule deposit account")]
    InvalidBasculeDeposit,
    #[msg("Invalid session payload account or payload")]
    InvalidSessionPayload,
    #[msg("Invalid message path")]
    InvalidMessagePath,
}

impl From<std::io::Error> for AssetRouterError {
    fn from(_error: std::io::Error) -> Self {
        AssetRouterError::BufferIOError
    }
}

impl From<ProgramError> for AssetRouterError {
    fn from(_error: ProgramError) -> Self {
        AssetRouterError::ProgramError
    }
}
