//! Instruction to finalize a notary session after signatures have been submitted
//! and the minimum weight threshold has been reached
use crate::{
    constants::{CONFIG_SEED, SESSION_PAYLOAD_SEED, VALIDATED_PAYLOAD_SEED},
    errors::ConsortiumError,
    events::ValidatorSetUpdated,
    state::{Config, SessionPayload, ValidatedPayload},
    utils::session_payloads::UpdateValSetPayload,
};

use anchor_lang::prelude::*;
use anchor_lang::solana_program::hash::hash as sha256;

#[derive(Accounts)]
#[instruction(payload_hash: [u8; 32])]
pub struct UpdateValset<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(mut, seeds = [CONFIG_SEED], bump)]
    pub config: Account<'info, Config>,
    #[account(
        seeds = [VALIDATED_PAYLOAD_SEED,
        &payload_hash[..]],
        constraint = validated_payload.latest_epoch == config.current_epoch @ ConsortiumError::ValidatedPayloadEpochMismatch,
        bump,
    )]
    pub validated_payload: Account<'info, ValidatedPayload>,
    #[account(
        mut,
        close = payer,
        seeds = [SESSION_PAYLOAD_SEED, &payer.key.to_bytes()[..], &payload_hash[..]],
        bump,
    )]
    pub session_payload: Account<'info, SessionPayload>,
}

pub fn update_valset(ctx: Context<UpdateValset>, payload_hash: [u8; 32]) -> Result<()> {
    let computed_payload_hash = sha256(&ctx.accounts.session_payload.payload);
    require!(
        computed_payload_hash.to_bytes() == payload_hash,
        ConsortiumError::SessionPayloadHashMismatch
    );

    let update_valset_payload =
        UpdateValSetPayload::from_session_payload(&ctx.accounts.session_payload.payload)?;

    update_valset_payload.validate_valset()?;

    require!(
        update_valset_payload.epoch == ctx.accounts.config.current_epoch + 1,
        ConsortiumError::NotConsecutiveEpoch
    );

    require!(
        update_valset_payload.height > ctx.accounts.config.current_height,
        ConsortiumError::NotIncrementingHeight
    );

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
