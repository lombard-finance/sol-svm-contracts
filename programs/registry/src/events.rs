//! Defines all events for the Lombard Finance protocol.
use anchor_lang::prelude::*;

#[event]
pub struct MessagePosted {
    pub sender: Pubkey,
    pub nonce: u32,
    pub message: Vec<u8>,
}
