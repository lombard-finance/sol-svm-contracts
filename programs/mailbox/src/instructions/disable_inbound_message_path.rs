use anchor_lang::prelude::*;

use crate::events::InboundMessagePathStatusChanged;
use crate::{
    constants::{CONFIG_SEED, INBOUND_MESSAGE_PATH_SEED},
    errors::MailboxError,
    state::{Config, InboundMessagePath},
};

#[derive(Accounts)]
#[instruction(source_chain_id: [u8; 32])]
pub struct DisableInboundMessagePath<'info> {
    #[account(mut, address = config.admin @ MailboxError::Unauthorized)]
    pub admin: Signer<'info>,
    #[account(
        mut,
        seeds = [CONFIG_SEED],
        bump,
    )]
    pub config: Account<'info, Config>,
    #[account(
        mut,
        close = admin,
        seeds = [
            INBOUND_MESSAGE_PATH_SEED,
            &source_chain_id,
        ],
        bump
    )]
    pub inbound_message_path: Account<'info, InboundMessagePath>,
    pub system_program: Program<'info, System>,
}

pub fn disable_inbound_message_path(
    ctx: Context<DisableInboundMessagePath>,
    source_chain_id: [u8; 32],
) -> Result<()> {
    emit!(InboundMessagePathStatusChanged {
        identifier: ctx.accounts.inbound_message_path.identifier,
        source_mailbox_address: ctx.accounts.inbound_message_path.source_mailbox_address,
        source_chain_id,
        enabled: false,
    });
    Ok(())
}
