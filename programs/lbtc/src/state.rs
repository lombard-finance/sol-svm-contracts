use crate::constants::MINT_PAYLOAD_LEN;
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
    #[max_len(102)]
    pub validators: Vec<[u8; 64]>,
    #[max_len(102)]
    pub weights: Vec<u64>,
    pub weight_threshold: u64,
}

#[account]
pub struct Used {
    pub used: bool,
}

#[account]
#[derive(InitSpace)]
pub struct MintPayload {
    pub payload: [u8; MINT_PAYLOAD_LEN],
    #[max_len(102)]
    pub signatures: Vec<[u8; 64]>,
    pub weight: u64,
}

#[account]
pub struct Metadata {
    pub validators: Vec<[u8; 64]>,
    pub weights: Vec<u64>,
}

#[account]
#[derive(InitSpace)]
pub struct ValsetPayload {
    pub epoch: u64,
    pub weight_threshold: u64,
    #[max_len(102)]
    pub signatures: Vec<[u8; 64]>,
    pub weight: u64,
}
