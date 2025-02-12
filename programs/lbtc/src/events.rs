//! Defines all events for the Lombard Finance protocol.
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
pub struct BasculeAddressChanged {
    pub address: Pubkey,
}

#[event]
pub struct DustFeeRateSet {
    pub rate: u64,
}

#[event]
pub struct ChainIdSet {
    pub chain_id: [u8; 32],
}

#[event]
pub struct DepositBtcActionSet {
    pub action: u32,
}

#[event]
pub struct ValsetActionSet {
    pub action: u32,
}

#[event]
pub struct FeeActionSet {
    pub action: u32,
}

#[event]
pub struct TreasuryChanged {
    pub address: Pubkey,
}

#[event]
pub struct MinterAdded {
    pub minter: Pubkey,
}

#[event]
pub struct MinterRemoved {
    pub minter: Pubkey,
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
    pub validators: Vec<[u8; 64]>,
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
    pub payload: Vec<u8>,
}
