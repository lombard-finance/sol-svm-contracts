use anchor_lang::prelude::*;

use crate::events::OutboundMessagePathStatusChanged;
use crate::utils::message_utils::message_path_identifier;
use crate::{
    constants::{CONFIG_SEED, OUTBOUND_MESSAGE_PATH_SEED, SELF_CHAIN_ID},
    errors::MailboxError,
    state::{Config, OutboundMessagePath},
    ID,
};

#[derive(Accounts)]
#[instruction(destination_chain_id: [u8; 32])]
pub struct EnableOutboundMessagePath<'info> {
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
        space = 8 + OutboundMessagePath::INIT_SPACE,
        seeds = [
            OUTBOUND_MESSAGE_PATH_SEED,
            &destination_chain_id,
        ],
        bump
    )]
    pub outbound_message_path: Account<'info, OutboundMessagePath>,
    pub system_program: Program<'info, System>,
}

pub fn enable_outbound_message_path(
    ctx: Context<EnableOutboundMessagePath>,
    destination_chain_id: [u8; 32],
) -> Result<()> {
    let identifier = message_path_identifier(ID.to_bytes(), SELF_CHAIN_ID, destination_chain_id);
    ctx.accounts.outbound_message_path.identifier = identifier;
    ctx.accounts.outbound_message_path.destination_chain_id = destination_chain_id;
    emit!(OutboundMessagePathStatusChanged {
        identifier,
        destination_chain_id,
        enabled: true,
    });
    Ok(())
}
