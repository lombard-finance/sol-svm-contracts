//! Sets the first validator set on the program.
use anchor_lang::prelude::*;

use crate::{
    constants::{self, SESSION_PAYLOAD_SEED}, errors::ConsortiumError, events::ValidatorSetUpdated, state::{Config, SessionPayload},
    utils::session_payloads::UpdateValSetPayload,
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

pub fn set_initial_valset_from_session(ctx: Context<SetInitialValsetFromSession>, payload_hash: [u8; 32]) -> Result<()> {
    require!(
        ctx.accounts.config.current_epoch == 0,
        ConsortiumError::ValidatorSetAlreadySet
    );

    let update_valset_payload = UpdateValSetPayload::from_session_payload(&ctx.accounts.session_payload.payload)?;
    ctx.accounts.config.current_epoch = update_valset_payload.epoch;
    ctx.accounts.config.current_validators = update_valset_payload.validators;
    ctx.accounts.config.current_weights = update_valset_payload.weights;
    ctx.accounts.config.current_weight_threshold = update_valset_payload.weight_threshold;
    ctx.accounts.config.current_height = update_valset_payload.height;

    emit!(ValidatorSetUpdated {
        epoch: ctx.accounts.config.current_epoch,
        payload_hash: payload_hash,
        validators: ctx.accounts.config.current_validators.clone(),
        weights: ctx.accounts.config.current_weights.clone(),
        weight_threshold: ctx.accounts.config.current_weight_threshold,
    });

    Ok(())
}
