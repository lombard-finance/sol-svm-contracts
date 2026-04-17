use anchor_lang::prelude::*;

pub mod constants;
pub mod errors;
pub mod instructions;
pub mod state;

use instructions::*;

declare_id!("CEL52cw8nR3woiKqm1ETzifdQqECwD3DBkLiAuQrrY43");

#[program]
pub mod mailbox_receiver {

    use super::*;

    pub fn initialize(ctx: Context<Initialize>, mailbox_address: Pubkey) -> Result<()> {
        instructions::initialize(ctx, mailbox_address)
    }

    pub fn gmp_receive(ctx: Context<GMPReceive>, payload_hash: [u8; 32]) -> Result<()> {
        instructions::gmp_receive(ctx, payload_hash)
    }

}