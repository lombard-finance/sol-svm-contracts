//! Initializes the LBTC program, simply setting the admin key.
use crate::state::Config;
use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(
        init,
        seeds = [b"lbtc_config"],
        bump,
        payer = payer,
        space = 8 + Config::INIT_SPACE
    )]
    pub config: Account<'info, Config>,
    pub system_program: Program<'info, System>,
}

pub fn initialize(ctx: Context<Initialize>, admin: Pubkey, mint: Pubkey) -> Result<()> {
    ctx.accounts.config.admin = admin;
    ctx.accounts.config.mint = mint;
    Ok(())
}
