use anchor_lang::prelude::*;
use mailbox::{constants::MESSAGE_SEED, state::MessageV1Info};

use crate::{constants::{CONFIG_SEED, MESSAGE_HANDLED_SEED}, state::{Config, MessageHandled}};

#[derive(Accounts)]
#[instruction(payload_hash: [u8; 32])]
pub struct GMPReceive<'info> {
    // The PDA from the mailbox program that contains the message.
    // Checking this account is signer ensures the message legitimately comes from the mailbox program.
    #[account(
        signer,
        seeds = [MESSAGE_SEED, &payload_hash],
        seeds::program = config.mailbox_address,
        bump,
    )]
    pub message_info: Account<'info, MessageV1Info>,

    // any other account needed to handle the message
    
    #[account(mut)]
    pub handler: Signer<'info>,

    #[account(seeds = [CONFIG_SEED], bump)]
    pub config: Account<'info, Config>,

    #[account(
        init,
        payer = handler,
        space = 8 + MessageHandled::INIT_SPACE,
        seeds = [MESSAGE_HANDLED_SEED, &payload_hash],
        bump,
    )]
    pub message_handled: Account<'info, MessageHandled>,

    pub system_program: Program<'info, System>,
}

pub fn gmp_receive(_ctx: Context<GMPReceive>, _payload_hash: [u8; 32]) -> Result<()> {
    Ok(())
}