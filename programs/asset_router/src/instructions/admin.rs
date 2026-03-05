//! Collection of admin-privileged functionality.
use crate::{
    constants,
    errors::AssetRouterError,
    events::{BasculeEnabled, OwnershipTransferInitiated, ProgramPaused},
    state::Config,
};
use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct Admin<'info> {
    #[account(address = config.admin @ AssetRouterError::Unauthorized)]
    pub payer: Signer<'info>,
    #[account(mut, seeds = [constants::CONFIG_SEED], bump)]
    pub config: Account<'info, Config>,
}

pub fn transfer_ownership(ctx: Context<Admin>, new_admin: Pubkey) -> Result<()> {
    ctx.accounts.config.pending_admin = new_admin;
    emit!(OwnershipTransferInitiated { new_admin });
    Ok(())
}

pub fn enable_bascule(ctx: Context<Admin>) -> Result<()> {
    ctx.accounts.config.bascule_enabled = true;
    emit!(BasculeEnabled { enabled: true });
    Ok(())
}

pub fn disable_bascule(ctx: Context<Admin>) -> Result<()> {
    ctx.accounts.config.bascule_enabled = false;
    emit!(BasculeEnabled { enabled: false });
    Ok(())
}

pub fn unpause(ctx: Context<Admin>) -> Result<()> {
    ctx.accounts.config.paused = false;
    emit!(ProgramPaused { paused: false });
    Ok(())
}
