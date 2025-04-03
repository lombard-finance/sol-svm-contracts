//! Functionality to post signatures for a posted mint payload.
use crate::{
    constants::CONFIG_SEED,
    errors::LBTCError,
    events::SignaturesAdded,
    state::{Config, MintPayload},
    utils::signatures,
};
use anchor_lang::prelude::*;

#[derive(Accounts)]
#[instruction(mint_payload_hash: [u8; 32])]
pub struct PostMintSignatures<'info> {
    #[account(seeds = [CONFIG_SEED], bump)]
    pub config: Account<'info, Config>,
    #[account(mut, seeds = [&mint_payload_hash], bump)]
    pub payload: Account<'info, MintPayload>,
}

pub fn post_mint_signatures(
    ctx: Context<PostMintSignatures>,
    mint_payload_hash: [u8; 32],
    signatures: Vec<[u8; 64]>,
    indices: Vec<u64>,
) -> Result<()> {
    require!(!ctx.accounts.config.paused, LBTCError::Paused);
    require!(ctx.accounts.config.epoch != 0, LBTCError::NoValidatorSet);
    require!(
        signatures.len() == indices.len(),
        LBTCError::SignaturesIndicesMismatch
    );

    // If the validator set has changed inbetween posting the mint payload and finalizing it,
    // we need to start from scratch.
    if ctx.accounts.payload.epoch != ctx.accounts.config.epoch {
        ctx.accounts.payload.epoch = ctx.accounts.config.epoch;
        ctx.accounts.payload.signed = vec![false; ctx.accounts.config.validators.len()];
        ctx.accounts.payload.weight = 0;
    }

    signatures
        .iter()
        .zip(indices.iter())
        .for_each(|(signature, index)| {
            if !ctx.accounts.payload.signed[*index as usize]
                && signatures::check_signature(
                    &ctx.accounts.config.validators[*index as usize],
                    signature,
                    &mint_payload_hash,
                )
            {
                ctx.accounts.payload.signed[*index as usize] = true;
                ctx.accounts.payload.weight += ctx.accounts.config.weights[*index as usize];
            }
        });
    emit!(SignaturesAdded {
        hash: mint_payload_hash,
        signatures
    });
    Ok(())
}
