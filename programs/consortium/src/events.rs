//! Defines all events for the Lombard Finance protocol.
use crate::constants::VALIDATOR_PUBKEY_SIZE;
use anchor_lang::prelude::*;

#[event]
pub struct ValidatorSetUpdated {
    pub epoch: u64,
    pub payload_hash: [u8; 32],
    pub validators: Vec<[u8; VALIDATOR_PUBKEY_SIZE]>,
    pub weights: Vec<u64>,
    pub weight_threshold: u64,
}

#[event]
pub struct SessionCreated {
    pub hash: [u8; 32],
}
#[event]
pub struct SessionPayloadChunkPosted {
    pub payload_hash: [u8; 32],
    pub payload_chunk: Vec<u8>,
}

#[event]
pub struct SessionFinalized {
    pub hash: [u8; 32],
}

#[event]
pub struct SessionSignaturesAdded {
    pub hash: [u8; 32],
    pub validator_indices: Vec<u64>,
}

#[event]
pub struct OwnershipTransferInitiated {
    pub new_admin: Pubkey,
}

#[event]
pub struct OwnershipTransferred {
    pub new_admin: Pubkey,
}
