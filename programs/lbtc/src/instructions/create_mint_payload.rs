//! Instruction to post a mint payload against which signatures can be posted.
use crate::{constants::MINT_PAYLOAD_LEN, events::MintPayloadPosted, state::MintPayload};
use anchor_lang::prelude::*;

#[derive(Accounts)]
#[instruction(mint_payload_hash: Vec<u8>, mint_payload: [u8; MINT_PAYLOAD_LEN])]
pub struct CreateMintPayload<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(
        init,
        payer = payer,
        space = MintPayload::INIT_SPACE,
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
    ctx.accounts.payload.payload = mint_payload.clone();
    emit!(MintPayloadPosted {
        hash: mint_payload_hash,
        payload: mint_payload,
    });
    Ok(())
}
