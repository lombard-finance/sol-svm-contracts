//! Functionality to set treasury address.
use crate::{events::TreasuryChanged, state::Config};
use anchor_lang::prelude::*;
use anchor_spl::token_interface::TokenAccount;

#[derive(Accounts)]
pub struct SetTreasury<'info> {
    #[account(address = config.admin)]
    pub payer: Signer<'info>,
    #[account(mut)]
    pub config: Account<'info, Config>,
    #[account(
        token::mint = config.mint,
    )]
    pub treasury: InterfaceAccount<'info, TokenAccount>,
}

pub fn set_treasury(ctx: Context<SetTreasury>) -> Result<()> {
    ctx.accounts.config.treasury = ctx.accounts.treasury.key();
    emit!(TreasuryChanged {
        address: ctx.accounts.treasury.key()
    });
    Ok(())
}
