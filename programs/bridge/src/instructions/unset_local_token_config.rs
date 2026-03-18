use anchor_lang::prelude::*;

use crate::constants::{CONFIG_SEED, LOCAL_TOKEN_CONFIG_SEED};
use crate::{
    errors::BridgeError,
    events::LocalTokenConfigUnset,
    state::{Config, LocalTokenConfig},
};

#[derive(Accounts)]
#[instruction(mint: Pubkey)]
pub struct UnsetLocalTokenConfig<'info> {
    #[account(mut, address = config.admin @ BridgeError::Unauthorized)]
    pub admin: Signer<'info>,
    #[account(mut, seeds = [CONFIG_SEED], bump)]
    pub config: Account<'info, Config>,
    #[account(
        mut,
        close = admin,
        seeds = [LOCAL_TOKEN_CONFIG_SEED, &mint.to_bytes()],
        bump = local_token_config.bump
    )]
    pub local_token_config: Account<'info, LocalTokenConfig>,
    pub system_program: Program<'info, System>,
}

pub fn unset_local_token_config(_ctx: Context<UnsetLocalTokenConfig>, mint: Pubkey) -> Result<()> {
    emit!(LocalTokenConfigUnset { mint });
    Ok(())
}
