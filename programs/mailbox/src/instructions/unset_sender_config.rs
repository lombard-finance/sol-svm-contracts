use anchor_lang::prelude::*;

use crate::constants::{CONFIG_SEED, SENDER_CONFIG_SEED};
use crate::{
    errors::MailboxError,
    events::SenderConfigUnset,
    state::{Config, SenderConfig},
};

#[derive(Accounts)]
#[instruction(sender_program: Pubkey)]
pub struct UnsetSenderConfig<'info> {
    #[account(mut, address = config.admin @ MailboxError::Unauthorized)]
    pub admin: Signer<'info>,
    #[account(mut, seeds = [CONFIG_SEED], bump)]
    pub config: Account<'info, Config>,
    #[account(
        mut,
        close = admin,
        seeds = [SENDER_CONFIG_SEED, &sender_program.to_bytes()],
        bump = sender_config.bump
    )]
    pub sender_config: Account<'info, SenderConfig>,
    pub system_program: Program<'info, System>,
}

pub fn unset_sender_config(_ctx: Context<UnsetSenderConfig>, sender_program: Pubkey) -> Result<()> {
    emit!(SenderConfigUnset { sender_program });
    Ok(())
}
