//! Adds validators and weights for a validator set being constructed.
use crate::{constants::VALIDATOR_PUBKEY_SIZE, events::ValsetMetadataPosted, state::Metadata};
use anchor_lang::prelude::*;

#[derive(Accounts)]
#[instruction(hash: [u8; 32])]
pub struct ValsetMetadata<'info> {
    pub payer: Signer<'info>,
    #[account(mut, seeds = [&hash, &crate::constants::METADATA_SEED, &payer.key.to_bytes()], bump)]
    pub metadata: Account<'info, Metadata>,
}

pub fn post_metadata_for_valset_payload(
    ctx: Context<ValsetMetadata>,
    hash: [u8; 32],
    validators: Vec<[u8; VALIDATOR_PUBKEY_SIZE]>,
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
