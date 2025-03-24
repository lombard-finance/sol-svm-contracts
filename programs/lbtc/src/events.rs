//! Defines all events for the Lombard Finance protocol.
use crate::constants::{MINT_PAYLOAD_LEN, VALIDATOR_PUBKEY_SIZE};
use anchor_lang::prelude::*;

#[event]
pub struct WithdrawalsEnabled {
    pub enabled: bool,
}

#[event]
pub struct BasculeEnabled {
    pub enabled: bool,
}

#[event]
pub struct MintFeeSet {
    pub mint_fee: u64,
}

#[event]
pub struct BurnCommissionSet {
    pub burn_commission: u64,
}

#[event]
pub struct OperatorSet {
    pub operator: Pubkey,
}

#[event]
pub struct DustFeeRateSet {
    pub rate: u64,
}

#[event]
pub struct TreasuryChanged {
    pub address: Pubkey,
}

#[event]
pub struct ClaimerAdded {
    pub claimer: Pubkey,
}

#[event]
pub struct ClaimerRemoved {
    pub claimer: Pubkey,
}

#[event]
pub struct PauserAdded {
    pub pauser: Pubkey,
}

#[event]
pub struct PauserRemoved {
    pub pauser: Pubkey,
}

#[event]
pub struct PauseEnabled {
    pub enabled: bool,
}

#[event]
pub struct ValidatorSetUpdated {
    pub epoch: u64,
    pub validators: Vec<[u8; VALIDATOR_PUBKEY_SIZE]>,
    pub weights: Vec<u64>,
    pub weight_threshold: u64,
}

#[event]
pub struct UnstakeRequest {
    pub from: Pubkey,
    pub script_pubkey: Vec<u8>,
    pub amount: u64,
}

#[event]
pub struct MintProofConsumed {
    pub recipient: Pubkey,
    pub payload_hash: [u8; 32],
}

#[event]
pub struct MintPayloadPosted {
    pub hash: [u8; 32],
    pub payload: [u8; MINT_PAYLOAD_LEN],
}

#[event]
pub struct ValsetMetadataCreated {
    pub hash: [u8; 32],
}

#[event]
pub struct ValsetMetadataPosted {
    pub hash: [u8; 32],
    pub validators: Vec<[u8; VALIDATOR_PUBKEY_SIZE]>,
    pub weights: Vec<u64>,
}

#[event]
pub struct ValsetPayloadCreated {
    pub hash: [u8; 32],
    pub epoch: u64,
    pub weight_threshold: u64,
    pub height: u64,
}

#[event]
pub struct SignaturesAdded {
    pub hash: [u8; 32],
    pub signatures: Vec<[u8; 64]>,
}

#[event]
pub struct BasculeChanged {
    pub address: Pubkey,
}

#[event]
pub struct OwnershipTransferInitiated {
    pub new_admin: Pubkey,
}

#[event]
pub struct OwnershipTransferred {
    pub new_admin: Pubkey,
}
