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

    // If the validator set has changed inbetween posting the payload and finalizing it,
    // we need to start from scratch.
    if ctx.accounts.session.epoch != ctx.accounts.config.current_epoch {
        ctx.accounts.session.new_epoch(
            ctx.accounts.config.current_epoch,
            ctx.accounts.config.current_validators.len(),
        );
    }

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
            }
        });
    emit!(SessionSignaturesAdded {
        hash: payload_hash,
        signatures
    });
    Ok(())
}
