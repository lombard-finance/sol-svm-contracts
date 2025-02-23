//! Adds validators and weights for a validator set being constructed.
use crate::{
    events::ValsetMetadataPosted,
    state::{Config, Metadata},
};
use anchor_lang::prelude::*;

// TODO metadata creation instruction
#[derive(Accounts)]
#[instruction(hash: Vec<u8>)]
pub struct ValsetMetadata<'info> {
    pub payer: Signer<'info>,
    pub config: Account<'info, Config>,
    #[account(mut, seeds = [&hash, b"metadata", &payer.key.to_bytes().to_vec()], bump)]
    pub metadata: Account<'info, Metadata>,
}

pub fn post_metadata_for_valset_payload(
    ctx: Context<ValsetMetadata>,
    hash: [u8; 32],
    validators: Vec<[u8; 65]>,
    weights: Vec<u64>,
) -> Result<()> {
    ctx.accounts.metadata.validators.extend(validators.clone());
    ctx.accounts.metadata.weights.extend(weights.clone());
    emit!(ValsetMetadataPosted {
        hash,
        validators,
        weights
    });
    Ok(())
}
