use anchor_lang::prelude::*;

use crate::constants::{MAX_VALIDATOR_SET_SIZE, VALIDATOR_PUBKEY_SIZE};

#[account]
#[derive(InitSpace)]
pub struct Config {
    // Authorities
    pub admin: Pubkey,
    pub pending_admin: Pubkey,

    // Consortium fields
    pub current_epoch: u64,
    #[max_len(MAX_VALIDATOR_SET_SIZE)]
    pub current_validators: Vec<[u8; VALIDATOR_PUBKEY_SIZE]>,
    #[max_len(MAX_VALIDATOR_SET_SIZE)]
    pub current_weights: Vec<u64>,
    pub current_weight_threshold: u64,
    pub current_height: u64,
}

#[account]
pub struct Session {
    pub signed: Vec<bool>,
    pub weight: u64,
}

impl Session {
    pub fn size(consortium_length: usize) -> usize {
        8 + // epoch
        4 + consortium_length + // signed
        8 // weight
    }
}

#[account]
#[derive(InitSpace)]
pub struct ValidatedPayload {
    pub latest_epoch: u64,
}

#[account]
pub struct SessionPayload {
    pub payload: Vec<u8>,
}

impl SessionPayload {
    pub fn size(payload_length: u32) -> usize {
        4 + payload_length as usize
    }
}
