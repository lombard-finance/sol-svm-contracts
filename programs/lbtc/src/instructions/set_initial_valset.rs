//! Sets the first validator set on the program.
use crate::{
    errors::LBTCError,
    events::ValidatorSetUpdated,
    state::{Config, Metadata, ValsetPayload},
    utils::validation,
};
use anchor_lang::prelude::*;

#[derive(Accounts)]
#[instruction(hash: [u8; 32])]
pub struct SetInitialValset<'info> {
    #[account(mut, address = config.admin)]
    pub payer: Signer<'info>,
    #[account(mut)]
    pub config: Account<'info, Config>,
    #[account(mut, close = payer, seeds = [&hash, &crate::constants::METADATA_SEED, &payer.key.to_bytes()], bump)]
    pub metadata: Account<'info, Metadata>,
    #[account(mut, close = payer, seeds = [&hash, &payer.key.to_bytes()], bump)]
    pub payload: Account<'info, ValsetPayload>,
}

pub fn set_initial_valset(ctx: Context<SetInitialValset>, _hash: [u8; 32]) -> Result<()> {
    validation::validate_valset(
        &ctx.accounts.metadata.validators,
        &ctx.accounts.metadata.weights,
        ctx.accounts.payload.weight_threshold,
    )?;
    require!(
        ctx.accounts.config.epoch == 0,
        LBTCError::ValidatorSetAlreadySet
    );
    require!(ctx.accounts.payload.epoch != 0, LBTCError::InvalidEpoch);

    ctx.accounts.config.epoch = ctx.accounts.payload.epoch;
    ctx.accounts.config.validators = ctx.accounts.metadata.validators.clone();
    ctx.accounts.config.weights = ctx.accounts.metadata.weights.clone();
    ctx.accounts.config.weight_threshold = ctx.accounts.payload.weight_threshold;
    emit!(ValidatorSetUpdated {
        epoch: ctx.accounts.config.epoch,
        validators: ctx.accounts.config.validators.clone(),
        weights: ctx.accounts.config.weights.clone(),
        weight_threshold: ctx.accounts.config.weight_threshold,
    });
    Ok(())
}
