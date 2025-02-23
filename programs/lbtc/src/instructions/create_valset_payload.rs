//! Posts a validator set payload against which signatures can be posted, or which can be
//! immediately used for an initial validator set.
use crate::{
    errors::LBTCError,
    events::ValsetPayloadCreated,
    state::{Config, Metadata, ValsetPayload},
    utils::actions::ValsetAction,
    constants,
};
use anchor_lang::prelude::*;
use solana_program::hash::Hash;

#[derive(Accounts)]
#[instruction(hash: Vec<u8>)]
pub struct CreateValset<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    pub config: Account<'info, Config>,
    #[account(mut, seeds = [&hash, b"metadata", &payer.key.to_bytes()], bump)]
    pub metadata: Account<'info, Metadata>,
    #[account(
        init, 
        payer = payer,
        space = ValsetPayload::INIT_SPACE,
        seeds = [&hash, &payer.key.to_bytes().to_vec()], 
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
    let bytes_hash = Hash::new(&bytes).to_bytes();
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
