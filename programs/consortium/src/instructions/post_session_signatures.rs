//! Functionality to post signatures for a consortium notary session.
use crate::{
    constants::{CONFIG_SEED, SESSION_SEED},
    errors::ConsortiumError,
    events::SessionSignaturesAdded,
    state::{Config, Session},
    utils::signatures,
};
use anchor_lang::prelude::*;

#[derive(Accounts)]
#[instruction(payload_hash: [u8; 32])]
pub struct PostSessionSignatures<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump)]
    pub config: Account<'info, Config>,
    #[account(
        mut,
        seeds = [SESSION_SEED, &config.current_epoch.to_be_bytes()[..], &payer.key.to_bytes()[..], &payload_hash[..]],
        bump
    )]
    pub session: Account<'info, Session>,
    pub system_program: Program<'info, System>,
}

pub fn post_session_signatures(
    ctx: Context<PostSessionSignatures>,
    payload_hash: [u8; 32],
    signatures: Vec<[u8; 64]>,
    indices: Vec<u64>,
) -> Result<()> {
    require!(
        ctx.accounts.config.current_epoch != 0,
        ConsortiumError::NoValidatorSet
    );
    require!(
        signatures.len() == indices.len(),
        ConsortiumError::SignaturesIndicesMismatch
    );

    // Defence-in-depth: `session.signed`, `current_validators` and `current_weights`
    // are parallel arrays sized to the validator set when the session is created
    // (see `create_session`). The loop below indexes all three with a caller-supplied
    // `index`, so assert that invariant explicitly and reject any out-of-bounds index
    // here. Without these guards a malformed index (or one that is stale after a valset
    // rotation) triggers an unchecked slice panic instead of a clean, typed error.
    let validators_len = ctx.accounts.config.current_validators.len();
    require!(
        ctx.accounts.session.signed.len() == validators_len
            && ctx.accounts.config.current_weights.len() == validators_len,
        ConsortiumError::SessionLengthMismatch
    );
    require!(
        indices.iter().all(|index| (*index as usize) < validators_len),
        ConsortiumError::IndexOutOfBounds
    );

    let mut validator_indices = Vec::new();
    signatures
        .iter()
        .zip(indices.iter())
        .for_each(|(signature, index)| {
            if !ctx.accounts.session.signed[*index as usize]
                && signatures::check_signature(
                    &ctx.accounts.config.current_validators[*index as usize],
                    signature,
                    &payload_hash,
                )
            {
                ctx.accounts.session.signed[*index as usize] = true;
                ctx.accounts.session.weight += ctx.accounts.config.current_weights[*index as usize];
                validator_indices.push(*index);
            }
        });

    emit!(SessionSignaturesAdded {
        hash: payload_hash,
        validator_indices,
    });
    Ok(())
}
