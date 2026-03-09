use anchor_lang::prelude::*;

use crate::constants::{CONFIG_SEED, REMOTE_BRIDGE_CONFIG_SEED};
use crate::{
    errors::BridgeError,
    events::RemoteBridgeConfigUnset,
    state::{Config, RemoteBridgeConfig},
};

#[derive(Accounts)]
#[instruction(chain_id: [u8; 32])]
pub struct UnsetRemoteBridgeConfig<'info> {
    #[account(mut, address = config.admin @ BridgeError::Unauthorized)]
    pub admin: Signer<'info>,
    #[account(mut, seeds = [CONFIG_SEED], bump)]
    pub config: Account<'info, Config>,
    #[account(
        mut,
        close = admin,
        seeds = [REMOTE_BRIDGE_CONFIG_SEED,&chain_id],
        bump = remote_bridge_config.bump
    )]
    pub remote_bridge_config: Account<'info, RemoteBridgeConfig>,
    pub system_program: Program<'info, System>,
}

pub fn unset_remote_bridge_config(_ctx: Context<UnsetRemoteBridgeConfig>, chain_id: [u8; 32]) -> Result<()> {
    emit!(RemoteBridgeConfigUnset { chain_id });
    Ok(())
}
