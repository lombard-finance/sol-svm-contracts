//! Initializes the LBTC program, setting all initial values.
use crate::{
    constants,
    errors::AssetRouterError,
    state::{Config, MessagingAuthority},
};
use anchor_lang::prelude::*;
use anchor_lang::solana_program::bpf_loader_upgradeable;

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
        seeds = [constants::CONFIG_SEED],
        bump,
        payer = deployer,
        space = 8 + Config::INIT_SPACE
    )]
    pub config: Account<'info, Config>,

    #[account(
        init,
        seeds = [constants::MESSAGING_AUTHORITY_SEED],
        bump,
        payer = deployer,
        space = 8 + MessagingAuthority::INIT_SPACE
    )]
    pub messaging_authority: Account<'info, MessagingAuthority>,

    pub system_program: Program<'info, System>,
}

//todo: set data for each signer pda so ownership is showed in explorer

pub fn initialize(ctx: Context<Initialize>, config: Config) -> Result<()> {
    ctx.accounts.config.admin = config.admin;
    ctx.accounts.config.pending_admin = Pubkey::default();
    ctx.accounts.config.paused = false;
    ctx.accounts.config.native_mint = config.native_mint;
    ctx.accounts.config.treasury = config.treasury;
    ctx.accounts.config.mailbox = config.mailbox;
    ctx.accounts.config.bascule_enabled = config.bascule_enabled;
    ctx.accounts.config.ledger_lchain_id = config.ledger_lchain_id;
    ctx.accounts.config.bitcoin_lchain_id = config.bitcoin_lchain_id;
    Ok(())
}
