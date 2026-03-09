use anchor_lang::prelude::*;
use anchor_lang::solana_program::program::invoke;
use anchor_lang::solana_program::system_instruction::transfer;

use crate::constants::{CONFIG_SEED, FEE_ADJUSTMET_BASE, OUTBOUND_MESSAGE, SENDER_CONFIG_SEED};
use crate::errors::MailboxError;
use crate::state::{Config, OutboundMessage, OutboundMessagePath, SenderConfig};
use crate::utils::message_utils::SendResult;

#[derive(Accounts)]
#[instruction(message_body: Vec<u8>)]
pub struct SendMessage<'info> {
    #[account(mut)]
    pub fee_payer: Signer<'info>,

    //todo: add check that owner of authority is not system program
    pub sender_authority: Signer<'info>,

    #[account(
        mut,
        constraint = config.paused == false @ MailboxError::Paused,
        seeds = [CONFIG_SEED],
        bump
    )]
    pub config: Account<'info, Config>,

    pub outbound_message_path: Account<'info, OutboundMessagePath>,

    #[account(
        init,
        payer = fee_payer,
        space = 8 + OutboundMessage::size(message_body.len()),
        seeds = [OUTBOUND_MESSAGE, &config.global_nonce.to_be_bytes()],
        bump
    )]
    pub outbound_message: Account<'info, OutboundMessage>,

    pub system_program: Program<'info, System>,

    #[account(mut)]
    pub treasury: Option<UncheckedAccount<'info>>,

    #[account(
        seeds = [SENDER_CONFIG_SEED, &sender_authority.owner.to_bytes()],
        bump
    )]
    pub sender_config: Option<Account<'info, SenderConfig>>,
}

pub fn send_message(
    ctx: Context<SendMessage>,
    message_body: Vec<u8>,
    recipient: [u8; 32],
    destination_caller: Option<[u8; 32]>,
    fee_override: u64,
) -> Result<SendResult> {
    let config = &mut ctx.accounts.config;
    let outbound_message = &mut ctx.accounts.outbound_message;

    let (mut fee_disabled, max_payload_size) = match &ctx.accounts.sender_config {
        Some(sender_config) => (sender_config.fee_disabled, sender_config.max_payload_size),
        None => (false, config.default_max_payload_size),
    };
    let mut fee_per_byte = config.fee_per_byte;
    if fee_disabled && fee_override > 0 {
        fee_per_byte = fee_per_byte * fee_override / FEE_ADJUSTMET_BASE;
        fee_disabled = false;
    }

    // Check payload size
    require!(
        message_body.len() <= max_payload_size as usize,
        MailboxError::PayloadTooLarge
    );

    outbound_message.0.nonce = config.global_nonce;
    outbound_message.0.body = message_body;
    outbound_message.0.destination_caller = destination_caller;
    outbound_message.0.recipient = recipient;
    outbound_message.0.message_path_identifier = ctx.accounts.outbound_message_path.identifier;
    outbound_message.0.sender = ctx.accounts.sender_authority.owner.to_bytes();

    if !fee_disabled {
        let fee = outbound_message.accountable_abi_bytes() * fee_per_byte;
        msg!("gmp fee: {}", fee);
        if fee != 0 {
            let treasury = match ctx.accounts.treasury.clone() {
                Some(treasury) => {
                    require_eq!(
                        treasury.key(),
                        config.treasury,
                        MailboxError::TreasuryMismatch
                    );
                    treasury
                }
                None => return err!(MailboxError::PublicSendWithFeeDisabled),
            };
            let account_infos = vec![
                ctx.accounts.fee_payer.to_account_info(),
                treasury.to_account_info(),
            ];
            invoke(
                &transfer(ctx.accounts.fee_payer.key, &treasury.key(), fee),
                &account_infos,
            )?
        }
    }

    emit!(crate::events::MessageSent {
        nonce: config.global_nonce,
    });

    // Increment global nonce
    config.global_nonce = config.global_nonce.checked_add(1).unwrap();

    Ok(SendResult{
        nonce: config.global_nonce,
        payload_hash:  outbound_message.0.calculate_payload_hash(),
    })
}
