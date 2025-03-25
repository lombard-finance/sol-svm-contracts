use crate::{
    constants::{MAX_VALIDATOR_SET_SIZE, MINT_PAYLOAD_LEN, VALIDATOR_PUBKEY_SIZE},
    utils::bitcoin_utils::P2TR_P2WSH_LEN,
};
use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct Config {
    // Authorities
    pub admin: Pubkey,
    pub pending_admin: Pubkey,
    pub operator: Pubkey,
    pub treasury: Pubkey,
    // NOTE: Since we have this as a contiguous block of memory, we can initially add more than 10
    // claimers (provided that the pausers vector is smaller than 10 elements at the time), so this
    // attribute is not a hard limit that's unique to the vector, but rather an instruction to
    // anchor about how much storage we allocate for this account.
    #[max_len(10)]
    pub claimers: Vec<Pubkey>,
    #[max_len(10)]
    pub pausers: Vec<Pubkey>,

    // Mint/redeem fields
    pub mint: Pubkey,
    pub burn_commission: u64,
    pub withdrawals_enabled: bool,
    pub dust_fee_rate: u64,
    pub bascule_enabled: bool,
    pub bascule: Pubkey,

    // Global pause
    pub paused: bool,

    // Automint fields
    pub mint_fee: u64,

    // Consortium fields
    pub epoch: u64,
    #[max_len(MAX_VALIDATOR_SET_SIZE)]
    pub validators: Vec<[u8; VALIDATOR_PUBKEY_SIZE]>,
    #[max_len(MAX_VALIDATOR_SET_SIZE)]
    pub weights: Vec<u64>,
    pub weight_threshold: u64,

    // Unstake counter, to generate unique PDAs for each unstake
    pub unstake_counter: u64,
}

#[account]
#[derive(InitSpace)]
pub struct MintPayload {
    pub epoch: u64,
    pub payload: [u8; MINT_PAYLOAD_LEN],
    #[max_len(MAX_VALIDATOR_SET_SIZE)]
    pub signed: Vec<bool>,
    pub weight: u64,
    pub minted: bool,
}

#[account]
#[derive(InitSpace)]
pub struct Metadata {
    pub hash: [u8; 32],
    #[max_len(MAX_VALIDATOR_SET_SIZE)]
    pub validators: Vec<[u8; VALIDATOR_PUBKEY_SIZE]>,
    #[max_len(MAX_VALIDATOR_SET_SIZE)]
    pub weights: Vec<u64>,
}

#[account]
#[derive(InitSpace)]
pub struct ValsetPayload {
    pub hash: [u8; 32],
    pub epoch: u64,
    pub weight_threshold: u64,
    #[max_len(MAX_VALIDATOR_SET_SIZE)]
    pub signed: Vec<bool>,
    pub weight: u64,
}

#[account]
#[derive(InitSpace)]
pub struct UnstakeInfo {
    pub from: Pubkey,
    #[max_len(P2TR_P2WSH_LEN)]
    pub script_pubkey: Vec<u8>,
    pub amount: u64,
}
