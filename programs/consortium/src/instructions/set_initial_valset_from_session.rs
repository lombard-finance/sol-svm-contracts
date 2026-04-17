//! Sets the first validator set on the program.
use anchor_lang::prelude::*;

use crate::{
    constants::{self, SESSION_PAYLOAD_SEED}, instructions::initialize_config_with_valset, state::{Config, SessionPayload}
};

#[derive(Accounts)]
#[instruction(payload_hash: [u8; 32])]
pub struct SetInitialValsetFromSession<'info> {
    #[account(mut, address = config.admin)]
    pub admin: Signer<'info>,
    #[account(mut, seeds = [constants::CONFIG_SEED], bump)]
    pub config: Account<'info, Config>,
    #[account(
        mut,
        close = admin,
        seeds = [SESSION_PAYLOAD_SEED, &admin.key.to_bytes()[..], &payload_hash[..]],
        bump,
    )]
    pub session_payload: Account<'info, SessionPayload>,
}

pub fn set_initial_valset_from_session(ctx: Context<SetInitialValsetFromSession>, _payload_hash: [u8; 32]) -> Result<()> {
    initialize_config_with_valset(&mut ctx.accounts.config, &ctx.accounts.session_payload.payload)
}
