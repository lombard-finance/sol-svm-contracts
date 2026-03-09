use anchor_lang::prelude::*;

use crate::{
    constants::{ANCHOR_DISCRIMINATOR, CONFIG, CURSES},
    errors::MockCcipRmnError,
    program::MockCcipRmn, 
    state::{Config, Curses}
};

#[derive(Accounts)]
pub struct Initialize<'info> {

    #[account(mut)]
    pub deployer: Signer<'info>,

    #[account(constraint = program.programdata_address()? == Some(program_data.key()))]
    pub program: Program<'info, MockCcipRmn>,

    // Initialization only allowed by program upgrade authority
    #[account(constraint = program_data.upgrade_authority_address == Some(deployer.key()) @ MockCcipRmnError::Unauthorized)]
    pub program_data: Account<'info, ProgramData>,

    #[account(
        init,
        seeds = [CONFIG],
        bump,
        payer = deployer,
        space = ANCHOR_DISCRIMINATOR + Config::INIT_SPACE,
    )]
    pub config: Account<'info, Config>,

    #[account(
        init,
        payer = deployer,
        space = ANCHOR_DISCRIMINATOR + Curses::INIT_SPACE,
        seeds = [CURSES],
        bump,
    )]
    pub curses: Account<'info, Curses>,

    pub system_program: Program<'info, System>,
}

pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
    ctx.accounts.config.version = 1;
    ctx.accounts.curses.version = 1;
    Ok(())
}