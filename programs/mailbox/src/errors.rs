//! Errors in the Lombard Mailbox protocol.
use anchor_lang::prelude::*;

#[error_code]
pub enum MailboxError {
    #[msg("Unauthorized function call")]
    Unauthorized,
    #[msg("Account role already granted")]
    AccountRoleAlreadyGranted,
    #[msg("Program is paused")]
    Paused,
    #[msg("Program is not paused")]
    NotPaused,
    #[msg("Invalid payload hash")]
    InvalidPayloadHash,
    #[msg("Invalid payload size")]
    InvalidPayloadLength,
    #[msg("Payload too large")]
    PayloadTooLarge,
    #[msg("Invalid payload selector")]
    InvalidPayloadSelector,
    #[msg("Invalid message path")]
    InvalidMessagePath,
    #[msg("Payload not found")]
    PayloadNotFound,
    #[msg("Payload already handled")]
    PayloadAlreadyHandled,
    #[msg("Invalid payload state")]
    InvalidPayloadState,
    #[msg("Insufficient funds for fee")]
    InsufficientFunds,
    #[msg("Invalid fee configuration")]
    InvalidFeeConfiguration,
    #[msg("Invalid admin")]
    InvalidAdmin,
    #[msg("Invalid pauser")]
    InvalidPauser,
    #[msg("Pauser already exists")]
    PauserAlreadyExists,
    #[msg("Pauser not found")]
    PauserNotFound,
    #[msg("Invalid nonce")]
    InvalidNonce,
    #[msg("Buffer IO error")]
    BufferIOError,
    #[msg("treasury mismatch")]
    TreasuryMismatch,
    #[msg("public send with fee disabled")]
    PublicSendWithFeeDisabled,
    #[msg("Invalid destination caller")]
    InvalidDestinationCaller,
}

impl From<std::io::Error> for MailboxError {
    fn from(_error: std::io::Error) -> Self {
        MailboxError::BufferIOError
    }
}
