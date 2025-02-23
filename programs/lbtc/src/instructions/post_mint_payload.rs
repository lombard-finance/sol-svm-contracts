//! Instruction to create a mint payload against which signatures can be posted.
use crate::events::MintPayloadPosted;
use crate::state::MintPayload;
use anchor_lang::prelude::*;

#[derive(Accounts)]
#[instruction(mint_payload_hash: Vec<u8>)]
pub struct CreateMintPayload<'info> {
    pub payer: Signer<'info>,
    #[account(
        init, 
        payer = payer, 
        space = MintPayload::INIT_SPACE, 
        seeds = [&mint_payload_hash], 
        bump,
    )]
    pub payload: Account<'info, MintPayload>,
}

pub fn create_mint_payload(
    ctx: Context<CreateMintPayload>,
    mint_payload_hash: [u8; 32],
    mint_payload: Vec<u8>,
) -> Result<()> {
    ctx.accounts.payload.payload = mint_payload.clone();
    emit!(MintPayloadPosted {
        hash: mint_payload_hash,
        payload: mint_payload,
    });
    Ok(())
}
