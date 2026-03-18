//! Functionality to set treasury address.
use crate::{constants, events::NativeMintChanged, state::Config};
use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct ChangeNativeToken<'info> {
    #[account(address = config.admin)]
    pub payer: Signer<'info>,
    #[account(mut, seeds = [constants::CONFIG_SEED], bump)]
    pub config: Account<'info, Config>,
}

pub fn change_native_mint(ctx: Context<ChangeNativeToken>, native_mint: Pubkey) -> Result<()> {
    ctx.accounts.config.native_mint = native_mint;
    emit!(NativeMintChanged { address: native_mint });
    Ok(())
}
