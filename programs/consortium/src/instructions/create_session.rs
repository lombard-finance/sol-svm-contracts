//! Instruction to create the on-chain descriptor for a consortium notary session.
use crate::{
    constants::{CONFIG_SEED, SESSION_SEED},
    errors::ConsortiumError,
    events::SessionCreated,
    state::{Config, Session},
};
use anchor_lang::prelude::*;

#[derive(Accounts)]
#[instruction(payload_hash: [u8; 32])]
pub struct CreateSession<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump)]
    pub config: Account<'info, Config>,
    #[account(
        init,
        payer = payer,
        // cannot put precise length here since consortium may change while
        // session is already created
        space = 8 + Session::size(config.current_validators.len()),
        seeds = [SESSION_SEED, &config.current_epoch.to_be_bytes()[..], &payer.key.to_bytes()[..], &payload_hash[..]],
        bump,
    )]
    pub session: Account<'info, Session>,
    pub system_program: Program<'info, System>,
}

pub fn create_session(ctx: Context<CreateSession>, payload_hash: [u8; 32]) -> Result<()> {
    // We should only allow creating sessions if a consortium exists.
    require!(
        ctx.accounts.config.current_epoch != 0,
        ConsortiumError::NoValidatorSet
    );

    ctx.accounts.session.signed = vec![false; ctx.accounts.config.current_validators.len()];

    emit!(SessionCreated { hash: payload_hash });

    Ok(())
}
