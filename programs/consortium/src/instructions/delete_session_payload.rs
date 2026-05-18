//! Instruction to finalize a notary session after signatures have been submitted
//! and the minimum weight threshold has been reached
use crate::{
    constants::{CONFIG_SEED, SESSION_PAYLOAD_SEED},
    state::{Config, SessionPayload},
};
use anchor_lang::prelude::*;

#[derive(Accounts)]
#[instruction(payload_hash: [u8; 32], payer: Pubkey)]
pub struct DeleteSessionPayload<'info> {
    #[account(mut, address = config.admin)]
    pub admin: Signer<'info>,
    #[account(mut, seeds = [CONFIG_SEED], bump)]
    pub config: Account<'info, Config>,
    #[account(
        mut,
        close = admin,
        seeds = [SESSION_PAYLOAD_SEED, &payer.to_bytes()[..], &payload_hash[..]],
        bump,
    )]
    pub session_payload: Account<'info, SessionPayload>,
    pub system_program: Program<'info, System>,
}

pub fn delete_session_payload(_: Context<DeleteSessionPayload>, _payload_hash: [u8; 32], _payer: Pubkey) -> Result<()> {
    Ok(())
}
