use anchor_lang::prelude::*;

use crate::constants::{CONFIG_SEED, REMOTE_TOKEN_CONFIG_SEED};
use crate::{
    errors::BridgeError,
    events::RemoteTokenConfigSet,
    state::{Config, RemoteTokenConfig},
};

#[derive(Accounts)]
#[instruction(mint: Pubkey, chain_id: [u8; 32])]
pub struct SetRemoteTokenConfig<'info> {
    #[account(mut, address = config.admin @ BridgeError::Unauthorized)]
    pub admin: Signer<'info>,
    #[account(mut, seeds = [CONFIG_SEED], bump)]
    pub config: Account<'info, Config>,
    #[account(
        init_if_needed,
        payer = admin,
        space = 8 + RemoteTokenConfig::INIT_SPACE,
        seeds = [REMOTE_TOKEN_CONFIG_SEED, &mint.to_bytes(), &chain_id],
        bump
    )]
    pub remote_token_config: Account<'info, RemoteTokenConfig>,
    pub system_program: Program<'info, System>,
}

pub fn set_remote_token_config(
    ctx: Context<SetRemoteTokenConfig>,
    mint: Pubkey,
    chain_id: [u8; 32],
    token: [u8; 32], 
    direction: u8,
) -> Result<()> {
    ctx.accounts.remote_token_config.bump = ctx.bumps.remote_token_config;
    ctx.accounts.remote_token_config.chain_id = chain_id;
    ctx.accounts.remote_token_config.token = token;
    ctx.accounts.remote_token_config.direction = direction;
    emit!(RemoteTokenConfigSet {
        mint,
        chain_id,
        token,
        direction
    });
    Ok(())
}
