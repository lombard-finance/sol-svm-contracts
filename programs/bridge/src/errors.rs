//! Errors in the Lombard Mailbox protocol.
use anchor_lang::prelude::*;

#[error_code]
pub enum BridgeError {
    #[msg("Unauthorized function call")]
    Unauthorized,
    #[msg("Account role already granted")]
    AccountRoleAlreadyGranted,
    #[msg("Program is paused")]
    Paused,
    #[msg("Program is not paused")]
    NotPaused,
    #[msg("Invalid admin")]
    InvalidAdmin,
    #[msg("Invalid pauser")]
    InvalidPauser,
    #[msg("Pauser already exists")]
    PauserAlreadyExists,
    #[msg("Pauser not found")]
    PauserNotFound,
    #[msg("Buffer IO error")]
    BufferIOError,
    #[msg("Invalid message sender")]
    InvalidMessageSender,
    #[msg("Invalid token address")]
    InvalidTokenAddress,
    #[msg("Mismatch between mint payload and passed account")]
    RecipientMismatch,
    #[msg("Zero amount")]
    ZeroAmount,
    #[msg("Invalid message length")]
    InvalidMessageLength,
    #[msg("Invalid message version")]
    InvalidMessageVersion,
    #[msg("Outbound direction disabled")]
    OutboundDirectionDisabled,
    #[msg("Inbound direction disabled")]
    InboundDirectionDisabled,
    #[msg("Caller not whitelisted")]
    NotWhitelisted,
    #[msg("Paid operation not supported")]
    PaidOperationNotSupported,
    #[msg("Unexpected fee discount value")]
    UnexpectedFeeDiscount,
    #[msg("Token owner mismatch")]
    WrongTokenOwner,
}

impl From<std::io::Error> for BridgeError {
    fn from(_error: std::io::Error) -> Self {
        BridgeError::BufferIOError
    }
}