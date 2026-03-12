//! Instruction to finalize a notary session after signatures have been submitted
//! and the minimum weight threshold has been reached
use crate::{
    constants::{CONFIG_SEED, SESSION_SEED, VALIDATED_PAYLOAD_SEED},
    errors::ConsortiumError,
    events::SessionFinalized,
    state::{Config, Session, ValidatedPayload},
};
use anchor_lang::prelude::*;

#[derive(Accounts)]
#[instruction(payload_hash: [u8; 32], epoch: u64)]
pub struct CloseSessionForEpoch<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(mut, seeds = [CONFIG_SEED], bump)]
    pub config: Account<'info, Config>,
    #[account(
        mut,
        close = payer,
        seeds = [SESSION_SEED, &epoch.to_le_bytes()[..], &payer.key.to_bytes()[..], &payload_hash[..]],
        bump
    )]
    pub session: Account<'info, Session>,
    pub system_program: Program<'info, System>,
}

pub fn close_session_for_epoch(_: Context<CloseSessionForEpoch>, _: [u8; 32], _: u64) -> Result<()> {
    Ok(())
}
