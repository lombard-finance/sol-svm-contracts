use anchor_lang::prelude::*;
use anchor_lang::solana_program::instruction::{AccountMeta, Instruction};
use anchor_lang::solana_program::program::{get_return_data, invoke_signed};

use crate::constants::{CONFIG_SEED, MESSAGE_SEED};
use crate::errors::MailboxError;
use crate::state::{Config, MessageState, MessageV1Info};
use crate::utils;

#[derive(Accounts)]
#[instruction(payload_hash: [u8; 32])]
pub struct HandleMessage<'info> {
    #[account(mut)]
    pub handler: Signer<'info>,
    #[account(
        constraint = config.paused == false @ MailboxError::Paused,
        seeds = [CONFIG_SEED],
        bump
    )]
    pub config: Account<'info, Config>,

    #[account(mut, seeds = [MESSAGE_SEED, &payload_hash], bump)]
    pub message_info: Account<'info, MessageV1Info>,

    /// CHECK: This is the program that will handle the message
    #[account(address = message_info.message.recipient.into())]
    pub recipient_program: UncheckedAccount<'info>,
}

pub fn handle_message<'a, 'b, 'c, 'info>(
    ctx: Context<'a, 'b, 'c, 'info, HandleMessage<'info>>,
    payload_hash: [u8; 32],
) -> Result<Option<Vec<u8>>> {
    let message_info = &mut ctx.accounts.message_info;

    if let Some(destination_caller) = message_info.message.destination_caller {
        require!(
            destination_caller == ctx.accounts.handler.key().to_bytes(),
            MailboxError::InvalidDestinationCaller
        );
    }

    // Check payload state
    require!(
        message_info.status == MessageState::Delivered,
        MailboxError::InvalidPayloadState
    );

    // Update payload state to handled
    message_info.status = MessageState::Handled;

    // Configure the CPI to handle the message on the recipient program

    // the message info is the account signing the CPI to the recipient program
    // this provides to the recipient program the proof that the message is legitimate
    let mut accounts = vec![AccountMeta::new_readonly(message_info.key(), true)];
    let mut account_infos = vec![message_info.to_account_info()];

    // the remaining accounts are the accounts needed to handle the message on the recipient program
    ctx.remaining_accounts.iter().for_each(|a| {
        accounts.push(match a.is_writable {
            true => AccountMeta::new(a.key(), a.is_signer),
            false => AccountMeta::new_readonly(a.key(), a.is_signer),
        });
        account_infos.push(a.to_account_info());
    });

    let instruction = Instruction {
        program_id: ctx.accounts.recipient_program.key(),
        accounts,
        data: utils::cpi::gmp_receive_instr_data(payload_hash),
    };

    invoke_signed(
        &instruction,
        &account_infos,
        &[&[MESSAGE_SEED, &payload_hash[..], &[ctx.bumps.message_info]]],
    )?;

    emit!(crate::events::MessageHandled { payload_hash });

    let result_data= match get_return_data() {
        Some(res) => if &res.0 == ctx.accounts.recipient_program.key {
            Some(res.1)
        } else { None },
        None => None
    };

    // todo: we could resize the message info account to save on-chain space and only
    // store the handled status discarding the message body

    Ok(result_data)
}
