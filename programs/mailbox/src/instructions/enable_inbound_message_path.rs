use anchor_lang::prelude::*;

use crate::events::InboundMessagePathStatusChanged;
use crate::utils::message_utils::message_path_identifier;
use crate::{
    constants::{CONFIG_SEED, INBOUND_MESSAGE_PATH_SEED, SELF_CHAIN_ID},
    errors::MailboxError,
    state::{Config, InboundMessagePath},
};

#[derive(Accounts)]
#[instruction(source_chain_id: [u8; 32])]
pub struct EnableInboundMessagePath<'info> {
    #[account(mut, address = config.admin @ MailboxError::Unauthorized)]
    pub admin: Signer<'info>,
    #[account(
        mut,
        seeds = [CONFIG_SEED],
        bump,
    )]
    pub config: Account<'info, Config>,
    #[account(
        init,
        payer = admin,
        space = 8 + InboundMessagePath::INIT_SPACE,
        seeds = [
            INBOUND_MESSAGE_PATH_SEED,
            &source_chain_id,
        ],
        bump
    )]
    pub inbound_message_path: Account<'info, InboundMessagePath>,
    pub system_program: Program<'info, System>,
}

pub fn enable_inbound_message_path(
    ctx: Context<EnableInboundMessagePath>,
    source_chain_id: [u8; 32],
    source_mailbox_address: [u8; 32],
) -> Result<()> {
    ctx.accounts.inbound_message_path.identifier =
        message_path_identifier(source_mailbox_address, source_chain_id, SELF_CHAIN_ID);
    ctx.accounts.inbound_message_path.source_mailbox_address = source_mailbox_address;
    ctx.accounts.inbound_message_path.source_chain_id = source_chain_id;
    emit!(InboundMessagePathStatusChanged {
        identifier: ctx.accounts.inbound_message_path.identifier,
        source_mailbox_address,
        source_chain_id,
        enabled: true,
    });
    Ok(())
}
