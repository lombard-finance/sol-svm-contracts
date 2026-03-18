//! Initializes the LBTC program, setting all initial values.
use crate::{constants, errors::ConsortiumError, state::Config};
use anchor_lang::prelude::*;
use anchor_lang::solana_program::bpf_loader_upgradeable;

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut,
        constraint = deployer.key() == program_data.upgrade_authority_address.unwrap_or_default() @ ConsortiumError::Unauthorized)
    ]
    pub deployer: Signer<'info>,

    #[account(
        seeds = [crate::ID.as_ref()],
        bump,
        seeds::program = bpf_loader_upgradeable::id(),
    )]
    pub program_data: Account<'info, ProgramData>,

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

pub fn initialize(ctx: Context<Initialize>, admin: Pubkey) -> Result<()> {
    ctx.accounts.config.admin = admin;
    Ok(())
}
