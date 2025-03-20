//! Creates a `Metadata` account for us to construct a validator set.
use crate::{events::ValsetMetadataCreated, state::Metadata};
use anchor_lang::prelude::*;

#[derive(Accounts)]
#[instruction(hash: [u8; 32])]
pub struct CreateValsetMetadata<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(
        init,
        payer = payer,
        space = 8 + Metadata::INIT_SPACE,
        seeds = [&hash, &crate::constants::METADATA_SEED, &payer.key.to_bytes()],
        bump,
    )]
    pub metadata: Account<'info, Metadata>,
    pub system_program: Program<'info, System>,
}

pub fn create_metadata_for_valset_payload(
    _ctx: Context<CreateValsetMetadata>,
    hash: [u8; 32],
) -> Result<()> {
    emit!(ValsetMetadataCreated { hash });
    Ok(())
}
