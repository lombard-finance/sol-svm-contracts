use anchor_lang::prelude::*;

use crate::constants::{CONFIG_SEED, MESSAGING_AUTHORITY_SEED, SENDER_CONFIG_SEED};
use crate::utils::account::get_pda;
use crate::{
    errors::MailboxError,
    events::SenderConfigUnset,
    state::{Config, SenderConfig},
};

#[derive(Accounts)]
#[instruction(sender: Pubkey, is_program: bool)]
pub struct UnsetSenderConfig<'info> {
    #[account(mut, address = config.admin @ MailboxError::Unauthorized)]
    pub admin: Signer<'info>,
    #[account(mut, seeds = [CONFIG_SEED], bump)]
    pub config: Account<'info, Config>,
    #[account(
        mut,
        close = admin,
        seeds = [
            SENDER_CONFIG_SEED,
            {
                let mut acc = sender;
                if is_program {
                    acc = get_pda(&[MESSAGING_AUTHORITY_SEED], &acc);
                }
                &acc.to_bytes()              
            }
        ],
        bump = sender_config.bump
    )]
    pub sender_config: Account<'info, SenderConfig>,
    pub system_program: Program<'info, System>,
}

pub fn unset_sender_config(_ctx: Context<UnsetSenderConfig>, sender: Pubkey, is_program: bool) -> Result<()> {
    emit!(SenderConfigUnset { sender, is_program });
    Ok(())
}
