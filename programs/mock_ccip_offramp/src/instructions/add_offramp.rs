use anchor_lang::prelude::*;
use base_token_pool::common::ALLOWED_OFFRAMP;

#[account]
#[derive(Copy, Debug, InitSpace)]
pub struct AllowedOfframp {}

#[derive(Accounts)]
#[instruction(source_chain_selector: u64, offramp: Pubkey)]
pub struct AddOfframp<'info> {
    #[account(
        init,
        seeds = [ALLOWED_OFFRAMP, source_chain_selector.to_le_bytes().as_ref(), offramp.as_ref()],
        bump,
        payer = authority,
        space = 8 + AllowedOfframp::INIT_SPACE,
    )]
    pub allowed_offramp: Account<'info, AllowedOfframp>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}

pub fn add_offramp(
    _ctx: Context<AddOfframp>,
    _source_chain_selector: u64,
    _offramp: Pubkey,
) -> Result<()> {
    msg!("Registering offramp as allowed for source chain. This is a mock of the router functionality.");
    Ok(())
}