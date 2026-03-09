use anchor_lang::prelude::*;
use base_token_pool::common::valid_version;
use rmn_remote::context::{MAX_CONFIG_V, MAX_CURSES_V};

use crate::{
    constants::{CONFIG, CURSES}, 
    errors::MockCcipRmnError, 
    state::{Config, CurseSubject, Curses}
};

#[derive(Accounts)]
pub struct InspectCurses<'info> {
    #[account(
        seeds = [CURSES],
        bump,
        constraint = valid_version(curses.version, MAX_CURSES_V) @ MockCcipRmnError::InvalidVersion,
    )]
    pub curses: Account<'info, Curses>,

    #[account(
        seeds = [CONFIG],
        bump,
        constraint = valid_version(config.version, MAX_CONFIG_V) @ MockCcipRmnError::InvalidVersion,
    )]
    pub config: Account<'info, Config>,
}

pub fn verify_not_cursed<'info>(
    _ctx: Context<InspectCurses>,
    _subject: CurseSubject,
) -> Result<()> {
    Ok(())
}
