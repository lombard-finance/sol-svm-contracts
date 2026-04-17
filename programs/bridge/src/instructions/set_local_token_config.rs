use anchor_lang::prelude::*;

use crate::constants::{CONFIG_SEED, LOCAL_TOKEN_CONFIG_SEED};
use crate::{
    errors::BridgeError,
    events::LocalTokenConfigSet,
    state::{Config, LocalTokenConfig},
};

#[derive(Accounts)]
#[instruction(mint: Pubkey)]
pub struct SetLocalTokenConfig<'info> {
    #[account(mut, address = config.admin @ BridgeError::Unauthorized)]
    pub admin: Signer<'info>,
    #[account(mut, seeds = [CONFIG_SEED], bump)]
    pub config: Account<'info, Config>,
    #[account(
        init_if_needed,
        payer = admin,
        space = 8 + LocalTokenConfig::INIT_SPACE,
        seeds = [LOCAL_TOKEN_CONFIG_SEED, &mint.to_bytes()],
        bump
    )]
    pub local_token_config: Account<'info, LocalTokenConfig>,
    pub system_program: Program<'info, System>,
}

pub fn set_local_token_config(
    ctx: Context<SetLocalTokenConfig>,
    mint: Pubkey, 
) -> Result<()> {
    ctx.accounts.local_token_config.bump = ctx.bumps.local_token_config;
    ctx.accounts.local_token_config.mint = mint;
    emit!(LocalTokenConfigSet {
        mint,
    });
    Ok(())
}
