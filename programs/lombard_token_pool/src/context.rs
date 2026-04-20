use anchor_lang::prelude::*;
use anchor_lang::solana_program;

#[derive(Accounts)]
pub struct Empty {}

#[inline]
pub fn get_pda(seeds: &[&[u8]], program_id: &Pubkey) -> Pubkey {
    Pubkey::find_program_address(seeds, program_id).0
}