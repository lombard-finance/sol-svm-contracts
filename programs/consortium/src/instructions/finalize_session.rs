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
#[instruction(payload_hash: [u8; 32])]
pub struct FinalizeSession<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(mut, seeds = [CONFIG_SEED], bump)]
    pub config: Account<'info, Config>,
    #[account(
        mut,
        close = payer,
        seeds = [SESSION_SEED, &config.current_epoch.to_be_bytes()[..], &payer.key.to_bytes()[..], &payload_hash[..]],
        bump
    )]
    pub session: Account<'info, Session>,
    #[account(
        init_if_needed,
        payer = payer,
        space = 8 + ValidatedPayload::INIT_SPACE,
        seeds = [VALIDATED_PAYLOAD_SEED, &payload_hash[..]],
        bump,
    )]
    pub validated_payload: Account<'info, ValidatedPayload>,
    pub system_program: Program<'info, System>,
}

pub fn finalize_session(ctx: Context<FinalizeSession>, payload_hash: [u8; 32]) -> Result<()> {
    require!(
        ctx.accounts.session.weight >= ctx.accounts.config.current_weight_threshold,
        ConsortiumError::NotEnoughSignatures
    );

    ctx.accounts.validated_payload.latest_epoch = ctx.accounts.config.current_epoch;

    emit!(SessionFinalized { hash: payload_hash });

    Ok(())
}
