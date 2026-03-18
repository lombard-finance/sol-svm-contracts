//! Errors in the Lombard protocol.
use anchor_lang::prelude::*;

#[error_code]
pub enum ConsortiumError {
    #[msg("Unauthorized function call")]
    Unauthorized,
    #[msg("Not enough signatures")]
    NotEnoughSignatures,
    #[msg("Leftover data in payload")]
    LeftoverData,
    #[msg("Validator set already set")]
    ValidatorSetAlreadySet,
    #[msg("Outdated epoch")]
    OutdatedEpoch,
    #[msg("No consecutive epoch")]
    NotConsecutiveEpoch,
    #[msg("Not incrementing height")]
    NotIncrementingHeight,
    #[msg("No validator set exists")]
    NoValidatorSet,
    #[msg("Validator set size too big")]
    ValidatorSetSizeTooBig,
    #[msg("Validator set size too small")]
    ValidatorSetSizeTooSmall,
    #[msg("Invalid weight threshold")]
    InvalidWeightThreshold,
    #[msg("Mismatch between validators length and weights length")]
    ValidatorsAndWeightsMismatch,
    #[msg("Weight for validator is zero")]
    ZeroWeight,
    #[msg("Sum of weights is below the threshold")]
    WeightsBelowThreshold,
    #[msg("Mismatch between signatures and indices length")]
    SignaturesIndicesMismatch,
    #[msg("Wrong selector of session payload")]
    WrongPayloadSelector,
    #[msg("Invalid session payload length")]
    InvalidPayloadLength,
    #[msg("Invalid validator pubkey length")]
    InvalidValidatorPubkeyLength,
    #[msg("Buffer IO error")]
    BufferIOError,
    #[msg("Empty payload chunk")]
    EmptyPayloadChunk,
    #[msg("Session payload hash mismatch")]
    SessionPayloadHashMismatch,
    #[msg("Validated payload account already exists")]
    ValidatedPayloadAlreadyExists,
    #[msg("Validated payload not empty")]
    ValidatedPayloadNotEmpty,
}

impl From<std::io::Error> for ConsortiumError {
    fn from(_error: std::io::Error) -> Self {
        ConsortiumError::BufferIOError
    }
}
