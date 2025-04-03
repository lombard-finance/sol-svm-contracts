//! Instruction to post a mint payload against which signatures can be posted.
use crate::{
    constants::{CONFIG_SEED, MINT_PAYLOAD_LEN},
    errors::LBTCError,
    events::MintPayloadPosted,
    state::{Config, MintPayload},
    utils::validation,
};
use anchor_lang::prelude::*;
use anchor_lang::solana_program::hash::hash as sha256;

#[derive(Accounts)]
#[instruction(mint_payload_hash: [u8; 32])]
pub struct CreateMintPayload<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump)]
    pub config: Account<'info, Config>,
    #[account(
        init,
        payer = payer,
        space = 8 + MintPayload::INIT_SPACE,
        seeds = [&mint_payload_hash],
        bump,
    )]
    pub payload: Account<'info, MintPayload>,
    pub system_program: Program<'info, System>,
}

pub fn create_mint_payload(
    ctx: Context<CreateMintPayload>,
    mint_payload_hash: [u8; 32],
    mint_payload: [u8; MINT_PAYLOAD_LEN],
) -> Result<()> {
    require!(!ctx.accounts.config.paused, LBTCError::Paused);
    // We should only allow creating mint payloads if a consortium exists.
    require!(
        ctx.accounts.config.weight_threshold != 0,
        LBTCError::NoValidatorSet
    );

    validation::pre_validate_mint(&mint_payload)?;

    let payload_hash = sha256(&mint_payload).to_bytes();
    if payload_hash != mint_payload_hash {
        return err!(LBTCError::MintPayloadHashMismatch);
    }

    ctx.accounts.payload.epoch = ctx.accounts.config.epoch;
    ctx.accounts.payload.payload = mint_payload.clone();
    ctx.accounts.payload.signed = vec![false; ctx.accounts.config.validators.len()];
    emit!(MintPayloadPosted {
        hash: mint_payload_hash,
        payload: mint_payload,
    });
    Ok(())
}
