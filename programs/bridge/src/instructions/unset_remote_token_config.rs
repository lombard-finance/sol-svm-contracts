use anchor_lang::prelude::*;

use crate::constants::{CONFIG_SEED, REMOTE_TOKEN_CONFIG_SEED};
use crate::{
    errors::BridgeError,
    events::RemoteTokenConfigUnset,
    state::{Config, RemoteTokenConfig},
};

#[derive(Accounts)]
#[instruction(mint: Pubkey, chain_id: [u8; 32])]
pub struct UnsetRemoteTokenConfig<'info> {
    #[account(mut, address = config.admin @ BridgeError::Unauthorized)]
    pub admin: Signer<'info>,
    #[account(mut, seeds = [CONFIG_SEED], bump)]
    pub config: Account<'info, Config>,
    #[account(
        mut,
        close = admin,
        seeds = [REMOTE_TOKEN_CONFIG_SEED, &mint.to_bytes(), &chain_id],
        bump = remote_token_config.bump
    )]
    pub remote_token_config: Account<'info, RemoteTokenConfig>,
    pub system_program: Program<'info, System>,
}

pub fn unset_remote_token_config(_ctx: Context<UnsetRemoteTokenConfig>, mint: Pubkey, chain_id: [u8; 32]) -> Result<()> {
    emit!(RemoteTokenConfigUnset { mint, chain_id });
    Ok(())
}
