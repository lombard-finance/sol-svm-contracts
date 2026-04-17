use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct Config {
    pub mailbox_address: Pubkey,
}

#[account]
#[derive(InitSpace)]
pub struct MessageHandled {}