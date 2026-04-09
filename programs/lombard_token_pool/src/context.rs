use anchor_lang::prelude::*;

#[derive(Accounts, Debug)]
pub struct Empty<'info> {
    // This is unused, but Anchor requires that there is at least one account in the context
    pub clock: Sysvar<'info, Clock>,
}
