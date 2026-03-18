use anchor_lang::prelude::*;

use crate::constants::{CONFIG_SEED, SENDER_CONFIG_SEED};
use crate::{
    errors::MailboxError,
    events::SenderConfigSet,
    state::{Config, SenderConfig},
};

#[derive(Accounts)]
#[instruction(sender_program: Pubkey)]
pub struct SetSenderConfig<'info> {
    #[account(mut, address = config.admin @ MailboxError::Unauthorized)]
    pub admin: Signer<'info>,
    #[account(mut, seeds = [CONFIG_SEED], bump)]
    pub config: Account<'info, Config>,
    #[account(
        init_if_needed,
        payer = admin,
        space = 8 + SenderConfig::INIT_SPACE,
        seeds = [SENDER_CONFIG_SEED, &sender_program.to_bytes()],
        bump
    )]
    pub sender_config: Account<'info, SenderConfig>,
    pub system_program: Program<'info, System>,
}

pub fn set_sender_config(
    ctx: Context<SetSenderConfig>,
    sender_program: Pubkey,
    max_payload_size: u32,
    fee_disabled: bool,
) -> Result<()> {
    ctx.accounts.sender_config.bump = ctx.bumps.sender_config;
    ctx.accounts.sender_config.max_payload_size = max_payload_size;
    ctx.accounts.sender_config.fee_disabled = fee_disabled;
    emit!(SenderConfigSet {
        sender_program,
        max_payload_size,
        fee_disabled,
    });
    Ok(())
}
