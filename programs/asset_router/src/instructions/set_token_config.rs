use crate::{
    constants,
    errors::AssetRouterError,
    state::{Config, TokenConfig},
};
use anchor_lang::prelude::*;

#[derive(Accounts)]
#[instruction(mint_address: Pubkey)]
pub struct SetTokenConfig<'info> {
    #[account(mut, address = config.admin @ AssetRouterError::Unauthorized)]
    pub payer: Signer<'info>,
    #[account(mut, seeds = [constants::CONFIG_SEED], bump)]
    pub config: Account<'info, Config>,
    #[account(
        init_if_needed,
        seeds = [constants::TOKEN_CONFIG_SEED, mint_address.as_ref()],
        bump,
        payer = payer,
        space = 8 + TokenConfig::INIT_SPACE
    )]
    pub token_config: Account<'info, TokenConfig>,
    pub system_program: Program<'info, System>,
}

pub fn set_token_config(
    ctx: Context<SetTokenConfig>,
    _mint_address: Pubkey,
    token_config: TokenConfig,
) -> Result<()> {
    ctx.accounts.token_config.redeem_fee = token_config.redeem_fee;
    ctx.accounts.token_config.redeem_for_btc_min_amount = token_config.redeem_for_btc_min_amount;
    ctx.accounts.token_config.max_mint_commission = token_config.max_mint_commission;
    ctx.accounts.token_config.to_native_commission = token_config.to_native_commission;
    ctx.accounts.token_config.ledger_redeem_handler = token_config.ledger_redeem_handler;
    emit!(crate::events::TokenConfigSet {
        config: token_config,
    });
    Ok(())
}
