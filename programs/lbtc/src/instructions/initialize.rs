//! Initializes the LBTC program, setting all initial values.
use crate::{constants, errors::LBTCError, state::Config};
use anchor_lang::prelude::*;
use anchor_lang::solana_program::bpf_loader_upgradeable;
use anchor_spl::token_interface::{Mint, TokenAccount};

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
        seeds = [constants::CONFIG_SEED],
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
    require!(burn_commission <= constants::MAX_FEE, LBTCError::FeeTooHigh);
    require!(mint_fee <= constants::MAX_FEE, LBTCError::FeeTooHigh);
    ctx.accounts.config.admin = admin;
    ctx.accounts.config.mint = ctx.accounts.mint.key();
    ctx.accounts.config.treasury = ctx.accounts.treasury.key();
    ctx.accounts.config.burn_commission = burn_commission;
    ctx.accounts.config.dust_fee_rate = dust_fee_rate;
    ctx.accounts.config.mint_fee = mint_fee;
    Ok(())
}
