use anchor_lang::prelude::*;
use anchor_lang::solana_program::bpf_loader_upgradeable;

use crate::constants::CONFIG_SEED;
use crate::errors::MailboxError;
use crate::state::Config;

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut,
        constraint = deployer.key() == program_data.upgrade_authority_address.unwrap_or_default() @ MailboxError::Unauthorized)
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
    consortium: Pubkey,
    treasury: Pubkey,
    default_max_payload_size: u32,
    fee_per_byte: u64,
) -> Result<()> {
    let config = &mut ctx.accounts.config;

    config.admin = admin;
    config.pending_admin = Pubkey::default();
    config.paused = false;
    config.consortium = consortium;
    config.treasury = treasury;
    config.global_nonce = 0;
    config.default_max_payload_size = default_max_payload_size;
    config.fee_per_byte = fee_per_byte;
    Ok(())
}
