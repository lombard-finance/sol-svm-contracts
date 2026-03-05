use anchor_lang::prelude::*;

pub mod constants;
pub mod errors;
pub mod events;
pub mod instructions;
pub mod security;
pub mod state;
pub mod utils;

use instructions::*;

declare_id!("2Zp4V3e64T5zNggMe75UdVPPBYxCvL9kFyd2LkJByjTj");

#[program]
pub mod consortium {

    use super::*;

    pub fn initialize(ctx: Context<Initialize>, admin: Pubkey) -> Result<()> {
        instructions::initialize(ctx, admin)
    }

    pub fn create_session(ctx: Context<CreateSession>, payload_hash: [u8; 32]) -> Result<()> {
        instructions::create_session(ctx, payload_hash)
    }

    pub fn post_session_signatures(
        ctx: Context<PostSessionSignatures>,
        payload_hash: [u8; 32],
        signatures: Vec<[u8; 64]>,
        indices: Vec<u64>,
    ) -> Result<()> {
        instructions::post_session_signatures(ctx, payload_hash, signatures, indices)
    }

    pub fn post_session_payload(
        ctx: Context<PostSessionPayload>,
        payload_hash: [u8; 32],
        payload_chunk: Vec<u8>,
        payload_length: u32,
    ) -> Result<()> {
        instructions::post_session_payload(ctx, payload_hash, payload_chunk, payload_length)
    }

    // TODO: add instruction to reset session payload for a user in case of error

    pub fn finalize_session(ctx: Context<FinalizeSession>, payload_hash: [u8; 32]) -> Result<()> {
        instructions::finalize_session(ctx, payload_hash)
    }

    pub fn set_initial_valset(ctx: Context<SetInitialValset>, payload: Vec<u8>) -> Result<()> {
        instructions::set_initial_valset(ctx, payload)
    }

    pub fn accept_ownership(ctx: Context<AcceptOwnership>) -> Result<()> {
        instructions::accept_ownership(ctx)
    }

    pub fn transfer_ownership(ctx: Context<Admin>, new_admin: Pubkey) -> Result<()> {
        instructions::transfer_ownership(ctx, new_admin)
    }

    pub fn update_valset(ctx: Context<UpdateValset>, payload_hash: [u8; 32]) -> Result<()> {
        instructions::update_valset(ctx, payload_hash)
    }
}
