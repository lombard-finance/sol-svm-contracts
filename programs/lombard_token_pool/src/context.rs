use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct Empty<'info> {
    /// CHECK: This is an empty account struct for instructions with no accounts
    pub anchor_workaround: UncheckedAccount<'info>,
}
