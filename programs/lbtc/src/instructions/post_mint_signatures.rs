//! Functionality to post signatures for a posted mint payload.
use crate::{
    errors::LBTCError,
    events::SignaturesAdded,
    state::{Config, MintPayload},
    utils::signatures,
};
use anchor_lang::prelude::*;

#[derive(Accounts)]
#[instruction(mint_payload_hash: [u8; 32])]
pub struct PostMintSignatures<'info> {
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
    signatures
        .iter()
        .zip(indices.iter())
        .for_each(|(signature, index)| {
            if !ctx
                .accounts
                .payload
                .signatures
                .iter()
                .any(|sig| sig == signature)
                && signatures::check_signature(
                    &ctx.accounts.config.validators[*index as usize],
                    signature,
                    &mint_payload_hash,
                )
            {
                ctx.accounts.payload.signatures.push(*signature);
                ctx.accounts.payload.weight += ctx.accounts.config.weights[*index as usize];
            }
        });
    emit!(SignaturesAdded {
        hash: mint_payload_hash,
        signatures
    });
    Ok(())
}
