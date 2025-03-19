//! Initializes the LBTC program, simply setting the admin key.
use crate::state::Config;
use anchor_lang::prelude::*;
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

pub fn initialize(ctx: Context<Initialize>, admin: Pubkey, mint: Pubkey) -> Result<()> {
    ctx.accounts.config.admin = admin;
    ctx.accounts.config.mint = mint;
    Ok(())
}
