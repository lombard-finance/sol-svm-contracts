//! Errors in the Lombard Mailbox protocol.
use anchor_lang::prelude::*;

#[error_code]
pub enum ReceiverError {
    #[msg("Invalid mailbox address")]
    InvalidMailboxAddress,
    #[msg("Unauthorized function call")]
    Unauthorized,
}