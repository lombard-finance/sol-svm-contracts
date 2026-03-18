use anchor_lang::prelude::*;
use anchor_lang::solana_program::bpf_loader_upgradeable;

use crate::constants::CONFIG_SEED;
use crate::errors::BasculeGmpError;
use crate::state::Config;

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        mut,
        constraint = deployer.key() == program_data.upgrade_authority_address.unwrap_or_default() @ BasculeGmpError::Unauthorized
    )]
    pub deployer: Signer<'info>,

    #[account(
        seeds = [crate::ID.as_ref()],
        bump,
        seeds::program = bpf_loader_upgradeable::id(),
    )]
    pub program_data: Account<'info, ProgramData>,

    #[account(
        init,
        payer = deployer,
        space = 8 + Config::INIT_SPACE,
        seeds = [CONFIG_SEED],
        bump
    )]
    pub config: Account<'info, Config>,
    pub system_program: Program<'info, System>,
}

pub fn initialize(
    ctx: Context<Initialize>,
    admin: Pubkey,
    validate_threshold: u64,
    trusted_signer: [u8; 64],
) -> Result<()> {
    let config = &mut ctx.accounts.config;
    config.admin = admin;
    config.pending_admin = Pubkey::default();
    config.paused = false;
    config.validate_threshold = validate_threshold;
    config.trusted_signer = trusted_signer;
    Ok(())
}
