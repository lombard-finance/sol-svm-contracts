//! Functionality to post signatures for a posted mint payload.
use crate::{
    errors::LBTCError,
    events::SignaturesAdded,
    state::{Config, MintPayload},
    utils::signatures,
};
use anchor_lang::prelude::*;

#[derive(Accounts)]
#[instruction(mint_payload_hash: Vec<u8>)]
pub struct PostSignaturesForMintPayload<'info> {
    pub config: Account<'info, Config>,
    #[account(mut, seeds = [&mint_payload_hash], bump)]
    pub payload: Account<'info, MintPayload>,
}

pub fn post_signatures_for_mint_payload(
    ctx: Context<PostSignaturesForMintPayload>,
    mint_payload_hash: [u8; 32],
    signatures: Vec<([u8; 64], usize)>,
) -> Result<()> {
    require!(ctx.accounts.config.epoch != 0, LBTCError::NoValidatorSet);
    signatures.iter().for_each(|(signature, index)| {
        if !ctx
            .accounts
            .payload
            .signatures
            .iter()
            .any(|sig| sig == signature)
            && signatures::check_signature(
                &ctx.accounts.config.validators[*index],
                signature,
                &mint_payload_hash,
            )
        {
            ctx.accounts.payload.signatures.push(*signature);
            ctx.accounts.payload.weight += ctx.accounts.config.weights[*index];
        }
    });
    emit!(SignaturesAdded {
        hash: mint_payload_hash,
        signatures
    });
    Ok(())
}
