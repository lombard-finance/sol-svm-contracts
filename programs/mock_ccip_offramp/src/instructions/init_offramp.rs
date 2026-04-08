use anchor_lang::prelude::*;

use crate::{
    constants::OFFRAMP_DATA_SEED,
    data::ReleaseOrMintInV1,
    state::ReleaseOrMintInV1Data,
};

#[derive(Accounts)]
#[instruction(nonce: u16)]
pub struct InitOfframp<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(
        init,
        payer = payer,
        // this is an excees estimation of the size of the account based on the fact the
        // abi encoding of the message cannot exceed the space taken by the message v1 struct
        space = 8 + ReleaseOrMintInV1Data::size(32),
        seeds = [OFFRAMP_DATA_SEED, &nonce.to_le_bytes()],
        bump
    )]
    pub offramp_data: Account<'info, ReleaseOrMintInV1Data>,

    pub system_program: Program<'info, System>,
}

pub fn init_offramp(ctx: Context<InitOfframp>, nonce: u16, data: ReleaseOrMintInV1) -> Result<()> {
    ctx.accounts.offramp_data.original_sender = data.original_sender;
    ctx.accounts.offramp_data.remote_chain_selector = data.remote_chain_selector;
    ctx.accounts.offramp_data.receiver = data.receiver;
    ctx.accounts.offramp_data.amount = data.amount;
    ctx.accounts.offramp_data.local_token = data.local_token;
    ctx.accounts.offramp_data.source_pool_address = data.source_pool_address;
    ctx.accounts.offramp_data.source_pool_data = data.source_pool_data;
    ctx.accounts.offramp_data.offchain_token_data = data.offchain_token_data;
    ctx.accounts.offramp_data.nonce = nonce;

    Ok(())
}
