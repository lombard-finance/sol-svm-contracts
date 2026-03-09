use anchor_lang::prelude::*;

use crate::{
    constants::{ANCHOR_DISCRIMINATOR, CONFIG_SEED,},
    errors::MockCcipOfframpError, 
    program::MockCcipOfframp, 
    state::{Config}
};

#[derive(Accounts)]
pub struct Initialize<'info> {

    #[account(mut)]
    pub deployer: Signer<'info>,

    #[account(constraint = program.programdata_address()? == Some(program_data.key()))]
    pub program: Program<'info, MockCcipOfframp>,

    // Initialization only allowed by program upgrade authority
    #[account(constraint = program_data.upgrade_authority_address == Some(deployer.key()) @ MockCcipOfframpError::Unauthorized)]
    pub program_data: Account<'info, ProgramData>,

    #[account(
        init,
        payer = deployer,
        space = ANCHOR_DISCRIMINATOR + Config::INIT_SPACE,
        seeds = [CONFIG_SEED],
        bump,
    )]
    pub config: Account<'info, Config>,

    pub system_program: Program<'info, System>,
}

pub fn initialize(ctx: Context<Initialize>, token_pool: Pubkey) -> Result<()> {
    let config = &mut ctx.accounts.config;
    config.token_pool = token_pool;
    Ok(())
}