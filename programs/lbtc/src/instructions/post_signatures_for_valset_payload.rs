//! Posts signatures for a given validator set payload.
use crate::{
    errors::LBTCError,
    events::SignaturesAdded,
    state::{Config, ValsetPayload},
    utils::signatures,
};
use anchor_lang::prelude::*;

#[derive(Accounts)]
#[instruction(hash: Vec<u8>)]
pub struct AddSignature<'info> {
    pub payer: Signer<'info>,
    #[account(mut)]
    pub config: Account<'info, Config>,
    #[account(mut, seeds = [&hash, &payer.key.to_bytes().to_vec()], bump)]
    pub payload: Account<'info, ValsetPayload>,
}

pub fn post_signatures_for_valset_payload(
    ctx: Context<AddSignature>,
    hash: [u8; 32],
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
                &hash,
            )
        {
            ctx.accounts.payload.signatures.push(*signature);
            ctx.accounts.payload.weight += ctx.accounts.config.weights[*index];
        }
    });
    emit!(SignaturesAdded { hash, signatures });
    Ok(())
}
