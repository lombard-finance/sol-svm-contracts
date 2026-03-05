use anchor_lang::prelude::*;
use anchor_lang::solana_program::hash::hash as sha256;

use consortium::constants::{SESSION_PAYLOAD_SEED, VALIDATED_PAYLOAD_SEED};
use consortium::state::{SessionPayload, ValidatedPayload};

use crate::constants::{CONFIG_SEED, MESSAGE_SEED};
use crate::errors::MailboxError;
use crate::state::{Config, InboundMessagePath, MessageState, MessageV1Info};
use crate::utils::message_utils::MessageV1;

#[derive(Accounts)]
#[instruction(payload_hash: [u8; 32])]
pub struct DeliverMessage<'info> {
    #[account(mut)]
    pub deliverer: Signer<'info>,
    #[account(
        constraint = config.paused == false @ MailboxError::Paused,
        seeds = [CONFIG_SEED],
        bump
    )]
    pub config: Account<'info, Config>,

    #[account(
        init,
        payer = deliverer,
        // this is an excees estimation of the size of the account based on the fact the
        // abi encoding of the message cannot exceed the space taken by the message v1 struct
        space = 8 + MessageV1Info::size(consortium_payload.payload.len()),
        seeds = [MESSAGE_SEED, &payload_hash],
        bump
    )]
    pub message_info: Account<'info, MessageV1Info>,

    pub inbound_message_path: Account<'info, InboundMessagePath>,

    // expects that the deliverer has submitted the full payload to the consortium program
    #[account(
        seeds = [SESSION_PAYLOAD_SEED, &deliverer.key.to_bytes()[..], &payload_hash[..]],
        seeds::program = config.consortium,
        bump
    )]
    pub consortium_payload: Account<'info, SessionPayload>,

    /// check that the consortium program has validated the payload
    #[account(
        seeds = [VALIDATED_PAYLOAD_SEED, &sha256(&consortium_payload.payload).to_bytes()[..]],
        seeds::program = config.consortium,
        bump
    )]
    pub consortium_validated_payload: Account<'info, ValidatedPayload>,

    pub system_program: Program<'info, System>,
}

pub fn deliver_message(ctx: Context<DeliverMessage>, payload_hash: [u8; 32]) -> Result<()> {
    let message_info = &mut ctx.accounts.message_info;

    // no need to check if the message was already deliverd or handled
    // since the account init would fail if it was already initialized

    let decoded_message =
        MessageV1::from_session_payload(&ctx.accounts.consortium_payload.payload)?;

    require!(
        decoded_message.message_path_identifier == ctx.accounts.inbound_message_path.identifier,
        MailboxError::InvalidMessagePath
    );

    // Update payload state to delivered
    message_info.status = MessageState::Delivered;
    message_info.message = decoded_message;

    emit!(crate::events::MessageDelivered {
        payload_hash,
        source_mailbox_address: ctx.accounts.inbound_message_path.source_mailbox_address,
        source_chain_id: ctx.accounts.inbound_message_path.source_chain_id,
    });

    Ok(())
}
