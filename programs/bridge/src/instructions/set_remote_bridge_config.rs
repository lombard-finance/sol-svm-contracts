use anchor_lang::prelude::*;

use crate::constants::{CONFIG_SEED, REMOTE_BRIDGE_CONFIG_SEED};
use crate::{
    errors::BridgeError,
    events::RemoteBridgeConfigSet,
    state::{Config, RemoteBridgeConfig},
};

#[derive(Accounts)]
#[instruction(chain_id: [u8; 32])]
pub struct SetRemoteBridgeConfig<'info> {
    #[account(mut, address = config.admin @ BridgeError::Unauthorized)]
    pub admin: Signer<'info>,
    #[account(mut, seeds = [CONFIG_SEED], bump)]
    pub config: Account<'info, Config>,
    #[account(
        init_if_needed,
        payer = admin,
        space = 8 + RemoteBridgeConfig::INIT_SPACE,
        seeds = [REMOTE_BRIDGE_CONFIG_SEED,&chain_id],
        bump
    )]
    pub remote_bridge_config: Account<'info, RemoteBridgeConfig>,
    pub system_program: Program<'info, System>,
}

pub fn set_remote_bridge_config(
    ctx: Context<SetRemoteBridgeConfig>,
    chain_id: [u8; 32],
    bridge: [u8; 32], 
) -> Result<()> {
    ctx.accounts.remote_bridge_config.bump = ctx.bumps.remote_bridge_config;
    ctx.accounts.remote_bridge_config.chain_id = chain_id;
    ctx.accounts.remote_bridge_config.bridge = bridge;
    emit!(RemoteBridgeConfigSet {
        chain_id,
        bridge,
    });
    Ok(())
}
