//! Sets the first validator set on the program.
use anchor_lang::prelude::*;
use anchor_lang::solana_program::hash::hash as sha256;

use crate::{
    constants, errors::ConsortiumError, events::ValidatorSetUpdated, state::Config,
    utils::session_payloads::UpdateValSetPayload,
};

#[derive(Accounts)]
pub struct SetInitialValset<'info> {
    #[account(mut, address = config.admin)]
    pub admin: Signer<'info>,
    #[account(mut, seeds = [constants::CONFIG_SEED], bump)]
    pub config: Account<'info, Config>,
}

pub fn set_initial_valset(ctx: Context<SetInitialValset>, payload: Vec<u8>) -> Result<()> {
    initialize_config_with_valset(&mut ctx.accounts.config, &payload)
}

pub fn initialize_config_with_valset(config: &mut Config, payload: &[u8]) -> Result<()> {
    require!(
        config.current_epoch == 0,
        ConsortiumError::ValidatorSetAlreadySet
    );

    let update_valset_payload = UpdateValSetPayload::from_session_payload(payload)?;
    update_valset_payload.validate_valset()?;
    config.current_epoch = update_valset_payload.epoch;
    config.current_validators = update_valset_payload.validators;
    config.current_weights = update_valset_payload.weights;
    config.current_weight_threshold = update_valset_payload.weight_threshold;
    config.current_height = update_valset_payload.height;

    emit!(ValidatorSetUpdated {
        epoch: config.current_epoch,
        payload_hash: sha256(payload).to_bytes(),
        validators: config.current_validators.clone(),
        weights: config.current_weights.clone(),
        weight_threshold: config.current_weight_threshold,
    });

    Ok(())
}
