//! Posts signatures for a given validator set payload.
use crate::{
    constants,
    errors::LBTCError,
    events::SignaturesAdded,
    state::{Config, ValsetPayload},
    utils::signatures,
};
use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct PostValsetSignatures<'info> {
    pub payer: Signer<'info>,
    #[account(seeds = [constants::CONFIG_SEED], bump)]
    pub config: Account<'info, Config>,
    #[account(mut, seeds = [&payload.hash, &payer.key.to_bytes()], bump)]
    pub payload: Account<'info, ValsetPayload>,
}

pub fn post_valset_signatures(
    ctx: Context<PostValsetSignatures>,
    signatures: Vec<[u8; 64]>,
    indices: Vec<u64>,
) -> Result<()> {
    require!(ctx.accounts.config.epoch != 0, LBTCError::NoValidatorSet);
    require!(
        signatures.len() == indices.len(),
        LBTCError::SignaturesIndicesMismatch
    );
    signatures
        .iter()
        .zip(indices.iter())
        .for_each(|(signature, index)| {
            if !ctx.accounts.payload.signed[*index as usize]
                && signatures::check_signature(
                    &ctx.accounts.config.validators[*index as usize],
                    signature,
                    &ctx.accounts.payload.hash,
                )
            {
                ctx.accounts.payload.signed[*index as usize] = true;
                ctx.accounts.payload.weight += ctx.accounts.config.weights[*index as usize];
            }
        });
    emit!(SignaturesAdded {
        hash: ctx.accounts.payload.hash,
        signatures
    });
    Ok(())
}
