//! Posts a validator set payload against which signatures can be posted, or which can be
//! immediately used for an initial validator set.
use crate::{
    constants,
    errors::LBTCError,
    events::ValsetPayloadCreated,
    state::{Config, Metadata, ValsetPayload},
    utils::{actions::ValsetAction, validation},
};
use anchor_lang::prelude::*;
use anchor_lang::solana_program::hash::hash as sha256;

#[derive(Accounts)]
pub struct CreateValset<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    pub config: Account<'info, Config>,
    #[account(mut, seeds = [&metadata.hash, &crate::constants::METADATA_SEED, &payer.key.to_bytes()], bump)]
    pub metadata: Account<'info, Metadata>,
    #[account(
        init,
        payer = payer,
        space = 8 + ValsetPayload::INIT_SPACE,
        seeds = [&metadata.hash, &payer.key.to_bytes()],
        bump,
    )]
    pub payload: Account<'info, ValsetPayload>,
    pub system_program: Program<'info, System>,
}

pub fn create_valset_payload(
    ctx: Context<CreateValset>,
    epoch: u64,
    weight_threshold: u64,
    height: u64,
) -> Result<()> {
    validation::validate_valset(
        &ctx.accounts.metadata.validators,
        &ctx.accounts.metadata.weights,
        weight_threshold,
    )?;

    // We construct the validator set payload and confirm that the posted hash matches.
    let payload = ValsetAction {
        action: constants::NEW_VALSET_ACTION,
        epoch,
        validators: ctx.accounts.metadata.validators.clone(),
        weights: ctx.accounts.metadata.weights.clone(),
        weight_threshold,
        height,
    };

    let bytes = payload.abi_encode();
    let bytes_hash = sha256(&bytes).to_bytes();
    require!(
        bytes_hash == ctx.accounts.metadata.hash,
        LBTCError::ValsetPayloadHashMismatch
    );

    ctx.accounts.payload.hash = ctx.accounts.metadata.hash;
    ctx.accounts.payload.epoch = epoch;
    ctx.accounts.payload.weight_threshold = weight_threshold;
    ctx.accounts.payload.signed = vec![false; ctx.accounts.config.validators.len()];
    emit!(ValsetPayloadCreated {
        hash: ctx.accounts.metadata.hash,
        epoch,
        weight_threshold,
        height,
    });
    Ok(())
}
