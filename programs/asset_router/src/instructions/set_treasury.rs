//! Functionality to set treasury address.
use crate::{constants, events::TreasuryChanged, state::Config};
use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct SetTreasury<'info> {
    #[account(address = config.admin)]
    pub payer: Signer<'info>,
    #[account(mut, seeds = [constants::CONFIG_SEED], bump)]
    pub config: Account<'info, Config>,
}

pub fn set_treasury(ctx: Context<SetTreasury>, treasury: Pubkey) -> Result<()> {
    ctx.accounts.config.treasury = treasury;
    emit!(TreasuryChanged { address: treasury });
    Ok(())
}
