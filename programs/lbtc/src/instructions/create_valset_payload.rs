//! Posts a validator set payload against which signatures can be posted, or which can be
//! immediately used for an initial validator set.
use crate::{
    constants,
    errors::LBTCError,
    events::ValsetPayloadCreated,
    state::{Metadata, ValsetPayload},
    utils::actions::ValsetAction,
};
use anchor_lang::prelude::*;
use solana_program::hash::hash as sha256;

#[derive(Accounts)]
#[instruction(hash: [u8; 32])]
pub struct CreateValset<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(mut, seeds = [&hash, &crate::constants::METADATA_SEED, &payer.key.to_bytes()], bump)]
    pub metadata: Account<'info, Metadata>,
    #[account(
        init,
        payer = payer,
        space = ValsetPayload::INIT_SPACE,
        seeds = [&hash, &payer.key.to_bytes()],
        bump,
    )]
    pub payload: Account<'info, ValsetPayload>,
    pub system_program: Program<'info, System>,
}

pub fn create_valset_payload(
    ctx: Context<CreateValset>,
    hash: [u8; 32],
    epoch: u64,
    weight_threshold: u64,
    height: u64,
) -> Result<()> {
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
    require!(bytes_hash == hash, LBTCError::ValsetPayloadHashMismatch);
    ctx.accounts.payload.epoch = epoch;
    ctx.accounts.payload.weight_threshold = weight_threshold;
    emit!(ValsetPayloadCreated {
        hash,
        epoch,
        weight_threshold,
        height,
    });
    Ok(())
}
