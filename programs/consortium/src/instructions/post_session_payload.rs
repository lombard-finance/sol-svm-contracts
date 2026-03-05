//! Instruction to create the on-chain descriptor for a consortium notary session.
use crate::{
    constants::SESSION_PAYLOAD_SEED, errors::ConsortiumError, events::SessionPayloadChunkPosted,
    state::SessionPayload,
};
use anchor_lang::prelude::*;

#[derive(Accounts)]
#[instruction(payload_hash: [u8; 32], payload_chunk: Vec<u8>, full_payload_length: u32)]
pub struct PostSessionPayload<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(
        init_if_needed,
        payer = payer,
        space = 8 + SessionPayload::size(full_payload_length),
        seeds = [SESSION_PAYLOAD_SEED, &payer.key.to_bytes()[..], &payload_hash[..]],
        bump,
    )]
    pub session_payload: Account<'info, SessionPayload>,
    pub system_program: Program<'info, System>,
}

pub fn post_session_payload(
    ctx: Context<PostSessionPayload>,
    payload_hash: [u8; 32],
    payload_chunk: Vec<u8>,
    // needed to compute space
    _full_payload_length: u32,
) -> Result<()> {
    require!(payload_chunk.len() > 0, ConsortiumError::EmptyPayloadChunk);

    ctx.accounts.session_payload.payload.extend(&payload_chunk);

    emit!(SessionPayloadChunkPosted {
        payload_hash: payload_hash,
        payload_chunk: payload_chunk,
    });

    Ok(())
}
