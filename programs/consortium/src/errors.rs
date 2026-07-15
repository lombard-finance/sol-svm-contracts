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
    #[msg("Validated payload epoch mismatch")]
    ValidatedPayloadEpochMismatch,
    #[msg("Epoch must be greater than zero")]
    InvalidEpoch,
    #[msg("Duplicate validator in validator set")]
    DuplicateValidator,
    #[msg("ABI word value overflows the target integer type")]
    AbiWordOverflow,
    #[msg("Signature index out of bounds for the current validator set")]
    IndexOutOfBounds,
    #[msg("session.signed, current_validators and current_weights lengths do not match")]
    SessionLengthMismatch,
}

impl From<std::io::Error> for ConsortiumError {
    fn from(_error: std::io::Error) -> Self {
        ConsortiumError::BufferIOError
    }
}
