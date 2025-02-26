use crate::constants::{MAX_VALIDATOR_SET_SIZE, MINT_PAYLOAD_LEN, VALIDATOR_PUBKEY_SIZE};
use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct Config {
    // Authorities
    pub admin: Pubkey,
    pub operator: Pubkey,
    pub treasury: Pubkey,
    #[max_len(10)]
    pub minters: Vec<Pubkey>,
    #[max_len(10)]
    pub claimers: Vec<Pubkey>,
    #[max_len(10)]
    pub pausers: Vec<Pubkey>,

    // Mint/redeem fields
    pub burn_commission: u64,
    pub withdrawals_enabled: bool,
    pub dust_fee_rate: u64,
    pub bascule_enabled: bool,

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
    #[max_len(MAX_VALIDATOR_SET_SIZE)]
    pub validators: Vec<[u8; VALIDATOR_PUBKEY_SIZE]>,
    #[max_len(MAX_VALIDATOR_SET_SIZE)]
    pub weights: Vec<u64>,
}

#[account]
#[derive(InitSpace)]
pub struct ValsetPayload {
    pub epoch: u64,
    pub weight_threshold: u64,
    #[max_len(MAX_VALIDATOR_SET_SIZE)]
    pub signed: Vec<bool>,
    pub weight: u64,
}
