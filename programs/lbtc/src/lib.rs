//! Implements the Lombard Finance protocol on Solana.
pub(crate) mod constants;
pub(crate) mod errors;
mod events;
pub mod instructions;
pub(crate) mod state;
pub(crate) mod utils;

use anchor_lang::prelude::*;
use constants::VALIDATOR_PUBKEY_SIZE;
use constants::{FEE_PAYLOAD_LEN, MINT_PAYLOAD_LEN};
use instructions::*;

declare_id!("5WFmz89q5RzSezsDQNCWoCJTEdYgne5u26kJPCyWvCEx");

#[program]
pub mod lbtc {
    use super::*;

    pub fn initialize(
        ctx: Context<Initialize>,
        admin: Pubkey,
        burn_commission: u64,
        dust_fee_rate: u64,
        mint_fee: u64,
    ) -> Result<()> {
        instructions::initialize(ctx, admin, burn_commission, dust_fee_rate, mint_fee)
    }

    pub fn create_mint_payload(
        ctx: Context<CreateMintPayload>,
        mint_payload_hash: [u8; 32],
        mint_payload: [u8; MINT_PAYLOAD_LEN],
    ) -> Result<()> {
        instructions::create_mint_payload(ctx, mint_payload_hash, mint_payload)
    }

    pub fn post_mint_signatures(
        ctx: Context<PostMintSignatures>,
        mint_payload_hash: [u8; 32],
        signatures: Vec<[u8; 64]>,
        indices: Vec<u64>,
    ) -> Result<()> {
        instructions::post_mint_signatures(ctx, mint_payload_hash, signatures, indices)
    }

    pub fn mint_from_payload(
        ctx: Context<MintFromPayload>,
        mint_payload_hash: [u8; 32],
    ) -> Result<()> {
        instructions::mint_from_payload(ctx, mint_payload_hash)
    }

    pub fn redeem(ctx: Context<Redeem>, script_pubkey: Vec<u8>, amount: u64) -> Result<()> {
        instructions::redeem(ctx, script_pubkey, amount)
    }

    pub fn mint_with_fee(
        ctx: Context<MintWithFee>,
        mint_payload_hash: [u8; 32],
        fee_payload: [u8; FEE_PAYLOAD_LEN],
        fee_signature: [u8; 64],
    ) -> Result<()> {
        instructions::mint_with_fee(ctx, mint_payload_hash, fee_payload, fee_signature)
    }

    pub fn set_initial_valset(ctx: Context<SetInitialValset>, hash: [u8; 32]) -> Result<()> {
        instructions::set_initial_valset(ctx, hash)
    }

    pub fn set_next_valset(ctx: Context<SetNextValset>, hash: [u8; 32]) -> Result<()> {
        instructions::set_next_valset(ctx, hash)
    }

    pub fn create_metadata_for_valset_payload(
        ctx: Context<CreateValsetMetadata>,
        hash: [u8; 32],
    ) -> Result<()> {
        instructions::create_metadata_for_valset_payload(ctx, hash)
    }

    pub fn post_metadata_for_valset_payload(
        ctx: Context<ValsetMetadata>,
        hash: [u8; 32],
        validators: Vec<[u8; VALIDATOR_PUBKEY_SIZE]>,
        weights: Vec<u64>,
    ) -> Result<()> {
        instructions::post_metadata_for_valset_payload(ctx, hash, validators, weights)
    }

    pub fn create_valset_payload(
        ctx: Context<CreateValset>,
        hash: [u8; 32],
        epoch: u64,
        weight_threshold: u64,
        height: u64,
    ) -> Result<()> {
        instructions::create_valset_payload(ctx, hash, epoch, weight_threshold, height)
    }

    pub fn post_valset_signatures(
        ctx: Context<PostValsetSignatures>,
        hash: [u8; 32],
        signatures: Vec<[u8; 64]>,
        indices: Vec<u64>,
    ) -> Result<()> {
        instructions::post_valset_signatures(ctx, hash, signatures, indices)
    }

    pub fn accept_ownership(ctx: Context<AcceptOwnership>) -> Result<()> {
        instructions::accept_ownership(ctx)
    }

    pub fn transfer_ownership(ctx: Context<Admin>, new_admin: Pubkey) -> Result<()> {
        instructions::transfer_ownership(ctx, new_admin)
    }

    pub fn enable_withdrawals(ctx: Context<Admin>) -> Result<()> {
        instructions::enable_withdrawals(ctx)
    }

    pub fn disable_withdrawals(ctx: Context<Admin>) -> Result<()> {
        instructions::disable_withdrawals(ctx)
    }

    pub fn enable_bascule(ctx: Context<Admin>) -> Result<()> {
        instructions::enable_bascule(ctx)
    }

    pub fn disable_bascule(ctx: Context<Admin>) -> Result<()> {
        instructions::disable_bascule(ctx)
    }

    pub fn set_mint_fee(ctx: Context<Operator>, mint_fee: u64) -> Result<()> {
        instructions::set_mint_fee(ctx, mint_fee)
    }

    pub fn set_burn_commission(ctx: Context<Admin>, commission: u64) -> Result<()> {
        instructions::set_burn_commission(ctx, commission)
    }

    pub fn set_operator(ctx: Context<Admin>, operator: Pubkey) -> Result<()> {
        instructions::set_operator(ctx, operator)
    }

    pub fn set_dust_fee_rate(ctx: Context<Admin>, rate: u64) -> Result<()> {
        instructions::set_dust_fee_rate(ctx, rate)
    }

    pub fn set_treasury(ctx: Context<SetTreasury>) -> Result<()> {
        instructions::set_treasury(ctx)
    }

    pub fn set_bascule(ctx: Context<Admin>, bascule: Pubkey) -> Result<()> {
        instructions::set_bascule(ctx, bascule)
    }

    pub fn add_claimer(ctx: Context<Admin>, claimer: Pubkey) -> Result<()> {
        instructions::add_claimer(ctx, claimer)
    }

    pub fn remove_claimer(ctx: Context<Admin>, claimer: Pubkey) -> Result<()> {
        instructions::remove_claimer(ctx, claimer)
    }

    pub fn add_pauser(ctx: Context<Admin>, pauser: Pubkey) -> Result<()> {
        instructions::add_pauser(ctx, pauser)
    }

    pub fn remove_pauser(ctx: Context<Admin>, pauser: Pubkey) -> Result<()> {
        instructions::remove_pauser(ctx, pauser)
    }

    pub fn pause(ctx: Context<Pause>) -> Result<()> {
        instructions::pause(ctx)
    }

    pub fn unpause(ctx: Context<Admin>) -> Result<()> {
        instructions::unpause(ctx)
    }
}
