//! Errors in the Lombard Token Pool.
use anchor_lang::prelude::*;

#[error_code]
pub enum LombardTokenPoolError {
    #[msg("Invalid token data")]
    InvalidTokenData = 6000, // offset for LombardTokenPoolErrors, so they don't overlap with errors of other CCIP programs
    #[msg("Invalid receiver")]
    InvalidReceiver,
    #[msg("Invalid source domain")]
    InvalidSourceDomain,
    #[msg("Invalid destination domain")]
    InvalidDestDomain,
    #[msg("Invalid nonce")]
    InvalidNonce,
    #[msg("Invalid Token Messenger Minter")]
    InvalidTokenMessengerMinter,
    #[msg("Invalid Bridge")]
    InvalidBridge,
    #[msg("Invalid Message Sent Event Account")]
    InvalidMessageSentEventAccount,
    #[msg("Invalid Token Pool Extra Data")]
    InvalidTokenPoolExtraData,
    #[msg("Failed to handle GMP message")]
    FailedGmpMessageHandle,
    #[msg("Fund Manager is invalid or misconfigured")]
    InvalidFundManager,
    #[msg("Invalid destination for funds reclaim")]
    InvalidReclaimDestination,
    #[msg("Insufficient funds")]
    InsufficientFunds,
    #[msg("Invalid SOL amount")]
    InvalidSolAmount,
    #[msg("Malformed Attestation data")]
    MalformedAttestationData,
    #[msg("Remote chain id mismatch")]
    RemoteChainMismatch,
    #[msg("Amount mismatch")]
    AmountMismatch,
    #[msg("Invalid payload size")]
    InvalidPayloadLength,
    #[msg("Invalid payload")]
    InvalidPayload,
}
