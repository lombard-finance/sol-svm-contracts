use anchor_lang::prelude::*;

use crate::utils::message_utils::message_path_identifier;
use crate::{
    constants::{CONFIG_SEED, OUTBOUND_MESSAGE_PATH_SEED, SELF_CHAIN_ID},
    errors::MailboxError,
    events::OutboundMessagePathStatusChanged,
    state::{Config, OutboundMessagePath},
    ID,
};

#[derive(Accounts)]
#[instruction(destination_chain_id: [u8; 32])]
pub struct DisableOutboundMessagePath<'info> {
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
            OUTBOUND_MESSAGE_PATH_SEED,
            &destination_chain_id,
        ],
        bump
    )]
    pub outbound_message_path: Account<'info, OutboundMessagePath>,
    pub system_program: Program<'info, System>,
}

pub fn disable_outbound_message_path(
    _ctx: Context<DisableOutboundMessagePath>,
    destination_chain_id: [u8; 32],
) -> Result<()> {
    emit!(OutboundMessagePathStatusChanged {
        identifier: message_path_identifier(ID.to_bytes(), SELF_CHAIN_ID, destination_chain_id),
        destination_chain_id,
        enabled: false,
    });
    Ok(())
}
