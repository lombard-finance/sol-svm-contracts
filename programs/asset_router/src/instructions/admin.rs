//! Collection of admin-privileged functionality.
use crate::{
    constants,
    errors::AssetRouterError,
    events::{OwnershipTransferInitiated, ProgramPaused},
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

pub fn set_bascule(ctx: Context<Admin>, bascule: Option<Pubkey>) -> Result<()> {
    ctx.accounts.config.bascule = bascule;
    Ok(())
}

pub fn set_bascule_gmp(ctx: Context<Admin>, bascule_gmp: Option<Pubkey>) -> Result<()> {
    ctx.accounts.config.bascule_gmp = bascule_gmp;
    Ok(())
}

pub fn unpause(ctx: Context<Admin>) -> Result<()> {
    ctx.accounts.config.paused = false;
    emit!(ProgramPaused { paused: false });
    Ok(())
}
