//! Pauses the program.
use crate::{errors::LBTCError, events::PauseEnabled, state::Config};
use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct Pause<'info> {
    pub payer: Signer<'info>,
    #[account(mut)]
    pub config: Account<'info, Config>,
}

pub fn pause(ctx: Context<Pause>) -> Result<()> {
    require!(
        ctx.accounts
            .config
            .pausers
            .iter()
            .any(|pauser| *pauser == ctx.accounts.payer.key()),
        LBTCError::Unauthorized
    );
    require!(!ctx.accounts.config.paused, LBTCError::Paused);
    ctx.accounts.config.paused = true;
    emit!(PauseEnabled { enabled: true });
    Ok(())
}

pub fn unpause(ctx: Context<Pause>) -> Result<()> {
    require!(
        ctx.accounts
            .config
            .pausers
            .iter()
            .any(|pauser| *pauser == ctx.accounts.payer.key()),
        LBTCError::Unauthorized
    );
    require!(ctx.accounts.config.paused, LBTCError::NotPaused);
    ctx.accounts.config.paused = false;
    emit!(PauseEnabled { enabled: false });
    Ok(())
}
