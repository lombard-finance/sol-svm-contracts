//! Instruction to create onchain storage with user message.
use crate::{
    constants::MESSAGE_SEED, events::MessagePosted,
};
use anchor_lang::prelude::*;

#[derive(Accounts)]
#[instruction(data: Vec<u8>, nonce: u32)]
pub struct PostMessage<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    /// CHECK: we do not introduce any structure to the message, just put data provided by the user as is
    #[account(
        init,
        payer = payer,
        space = data.len(),
        seeds = [MESSAGE_SEED, &payer.key.to_bytes()[..], &nonce.to_be_bytes()[..]],
        bump,
    )]
    pub message: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

pub fn post_message(ctx: Context<PostMessage>, data: Vec<u8>, nonce: u32) -> Result<()> {
    let message_account = &mut ctx.accounts.message;
    message_account.try_borrow_mut_data()?.copy_from_slice(&data);

    emit!(MessagePosted {
        sender: ctx.accounts.payer.key(),
        nonce: nonce,
        message: data,
    });

    Ok(())
}
