//! Initializes the LBTC program, simply setting the admin key.
use crate::{errors::LBTCError, state::Config};
use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, TokenAccount};
use solana_program::bpf_loader_upgradeable;

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut,
        constraint = deployer.key() == program_data.upgrade_authority_address.unwrap_or_default())
    ]
    pub deployer: Signer<'info>,

    #[account(
        seeds = [crate::ID.as_ref()],
        bump,
        seeds::program = bpf_loader_upgradeable::id(),
    )]
    pub program_data: Account<'info, ProgramData>,

    pub mint: InterfaceAccount<'info, Mint>,
    #[account(
        token::mint = mint,
    )]
    pub treasury: InterfaceAccount<'info, TokenAccount>,

    #[account(
        init,
        seeds = [b"lbtc_config"],
        bump,
        payer = deployer,
        space = 8 + Config::INIT_SPACE
    )]
    pub config: Account<'info, Config>,
    pub system_program: Program<'info, System>,
}

pub fn initialize(
    ctx: Context<Initialize>,
    admin: Pubkey,
    burn_commission: u64,
    dust_fee_rate: u64,
    mint_fee: u64,
) -> Result<()> {
    require!(burn_commission <= 100000, LBTCError::FeeTooHigh);
    require!(mint_fee <= 100000, LBTCError::FeeTooHigh);
    ctx.accounts.config.admin = admin;
    ctx.accounts.config.mint = ctx.accounts.mint.key();
    ctx.accounts.config.treasury = ctx.accounts.treasury.key();
    ctx.accounts.config.burn_commission = burn_commission;
    ctx.accounts.config.dust_fee_rate = dust_fee_rate;
    ctx.accounts.config.mint_fee = mint_fee;
    Ok(())
}
