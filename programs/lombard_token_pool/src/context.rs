use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct Empty<'info> {
    pub system_program: Program<'info, System>
}
