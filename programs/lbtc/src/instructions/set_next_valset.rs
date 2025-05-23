//! Updates the validator set on the program.
use crate::{
    constants,
    errors::LBTCError,
    events::ValidatorSetUpdated,
    state::{Config, Metadata, ValsetPayload},
};
use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct SetNextValset<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(mut, seeds = [constants::CONFIG_SEED], bump)]
    pub config: Account<'info, Config>,
    #[account(mut, close = payer, seeds = [&metadata.hash, &crate::constants::METADATA_SEED, &payer.key.to_bytes()], bump)]
    pub metadata: Account<'info, Metadata>,
    #[account(mut, close = payer, seeds = [&payload.hash, &payer.key.to_bytes()], bump)]
    pub payload: Account<'info, ValsetPayload>,
}

pub fn set_next_valset(ctx: Context<SetNextValset>) -> Result<()> {
    require!(ctx.accounts.config.epoch != 0, LBTCError::NoValidatorSet);
    require!(
        ctx.accounts.payload.epoch == ctx.accounts.config.epoch + 1,
        LBTCError::InvalidEpoch
    );
    require!(
        ctx.accounts.payload.weight >= ctx.accounts.config.weight_threshold,
        LBTCError::NotEnoughSignatures
    );

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
