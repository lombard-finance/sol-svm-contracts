use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct Config {
    // Authorities
    pub admin: Pubkey,
    pub pending_admin: Pubkey,

    pub consortium: Pubkey,
}

#[account]
pub struct Oracle {
    // token info
    pub denom: String,
    pub mint_address: Pubkey,
    // ratio info
    pub previous_ratio: Option<u128>,
    pub current_ratio: u128,
    pub switch_time: u64,
    pub max_ahead_interval: u64,
    // diff between current and new ratio in percent, measured to 6 signs (0.000001% ... 100%)
    pub ratio_threshold: u128,
}

impl Oracle {
    pub fn size(denom_length: usize) -> usize {
        4 + denom_length + // denom
        32 + // mint_address
        1 + 16 + // previous_ratio with 1 byte for option
        16 + // current_ratio
        8 + // switch_time
        8 + // max_ahead_interval
        16 // ratio_threshold
    }
}
