//! Implements the Lombard Finance protocol on Solana.
pub(crate) mod constants;
pub(crate) mod errors;
mod events;
pub mod instructions;
pub mod security;
pub(crate) mod state;
pub(crate) mod utils;

use anchor_lang::prelude::*;
use instructions::*;
use utils::consortium_payloads::RATIO_UPDATE_PAYLOAD_LEN;

#[cfg(feature = "mainnet")]
declare_id!("ToDo111111111111111111111111111111111111111");
#[cfg(feature = "gastald")]
declare_id!("LomWze3gBt8Y7RN3sspuh2jupqAQPUi4tuaLWDnf6CZ");
#[cfg(feature = "staging")]
declare_id!("LomMaT3jSjMiECtPrK4pLfzNQB2uMaxMqGenBbimjWq");
#[cfg(feature = "bft")]
declare_id!("LomfreVHrrMrSpv54KCJ6AC1eKL8QbL1Ej28S3gwawa");
#[cfg(not(any(feature = "mainnet", feature = "gastald", feature = "staging", feature = "bft")))]
declare_id!("DaoKGsbRU8sYBwy3CL5uYcWPaRYcFGQVypzUQBarKifT");

#[program]
pub mod ratio_oracle {

    use super::*;

    pub fn initialize(ctx: Context<Initialize>, admin: Pubkey, consortium: Pubkey) -> Result<()> {
        instructions::initialize(ctx, admin, consortium)
    }

    pub fn accept_ownership(ctx: Context<AcceptOwnership>) -> Result<()> {
        instructions::accept_ownership(ctx)
    }

    pub fn transfer_ownership(ctx: Context<Admin>, new_admin: Pubkey) -> Result<()> {
        instructions::transfer_ownership(ctx, new_admin)
    }

    pub fn update_ratio_threshold(
        ctx: Context<UpdateRatioThreshold>,
        ratio_threshold: u128,
    ) -> Result<()> {
        instructions::update_ratio_threshold(ctx, ratio_threshold)
    }

    pub fn update_consortium(ctx: Context<Admin>, consortium: Pubkey) -> Result<()> {
        instructions::update_consortium(ctx, consortium)
    }

    pub fn initialize_oracle(
        ctx: Context<InitializeOracle>,
        denom: String,
        mint_address: Pubkey,
        initial_ratio: u128,
        switch_time: u64,
        max_ahead_interval: u64,
        ratio_threshold: u128,
    ) -> Result<()> {
        instructions::initialize_oracle(
            ctx,
            denom,
            mint_address,
            initial_ratio,
            switch_time,
            max_ahead_interval,
            ratio_threshold,
        )
    }

    pub fn publish_ratio(
        ctx: Context<PublishRatio>,
        payload: [u8; RATIO_UPDATE_PAYLOAD_LEN],
    ) -> Result<()> {
        instructions::publish_ratio(ctx, payload)
    }
}
