use anchor_lang::prelude::*;

use crate::constants::CONFIG_SEED;
use crate::errors::MailboxError;
use crate::events::{ProgramPaused, TreasuryChanged};
use crate::state::Config;

#[derive(Accounts)]
pub struct Admin<'info> {
    #[account(address = config.admin @ MailboxError::Unauthorized)]
    pub admin: Signer<'info>,
    #[account(
        mut,
        seeds = [CONFIG_SEED],
        bump,
    )]
    pub config: Account<'info, Config>,
}

pub fn transfer_ownership(ctx: Context<Admin>, new_admin: Pubkey) -> Result<()> {
    let config = &mut ctx.accounts.config;
    config.pending_admin = new_admin;

    emit!(crate::events::OwnershipTransferInitiated { new_admin });

    Ok(())
}

pub fn update_config(
    ctx: Context<Admin>,
    default_max_payload_size: Option<u32>,
    fee_per_byte: Option<u64>,
) -> Result<()> {
    let config = &mut ctx.accounts.config;

    if let Some(size) = default_max_payload_size {
        config.default_max_payload_size = size;
    }

    if let Some(fee) = fee_per_byte {
        config.fee_per_byte = fee;
    }

    emit!(crate::events::ConfigUpdated {
        admin: config.admin,
        default_max_payload_size: config.default_max_payload_size,
        fee_per_byte: config.fee_per_byte,
    });

    Ok(())
}

pub fn set_treasury(ctx: Context<Admin>, new_treasury: Pubkey) -> Result<()> {
    emit!(TreasuryChanged {
        old_treasury: ctx.accounts.config.treasury,
        new_treasury: new_treasury
    });
    ctx.accounts.config.treasury = new_treasury;
    Ok(())
}

pub fn unpause(ctx: Context<Admin>) -> Result<()> {
    let config = &mut ctx.accounts.config;

    require!(config.paused, MailboxError::NotPaused);

    config.paused = false;

    emit!(ProgramPaused { paused: false });

    Ok(())
}
