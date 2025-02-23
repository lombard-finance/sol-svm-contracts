//! Native redeem functionality for LBTC.
use crate::{
    errors::LBTCError,
    events::UnstakeRequest,
    state::Config,
    utils::{self, bitcoin_utils},
};
use anchor_lang::prelude::*;
use anchor_spl::token_interface::{self, TokenAccount, TokenInterface};

#[derive(Accounts)]
pub struct Redeem<'info> {
    pub payer: Signer<'info>,
    pub config: Account<'info, Config>,
    pub token_program: Interface<'info, TokenInterface>,
    pub token_mint: InterfaceAccount<'info, TokenAccount>,
    #[account(
        seeds = [crate::constants::TOKEN_AUTHORITY_SEED],
        bump,
    )]
    pub token_authority: InterfaceAccount<'info, TokenAccount>,
    pub treasury: InterfaceAccount<'info, TokenAccount>,
}

pub fn redeem(ctx: Context<Redeem>, script_pubkey: Vec<u8>, amount: u64) -> Result<()> {
    require!(!ctx.accounts.config.paused, LBTCError::Paused);
    require!(
        ctx.accounts.config.withdrawals_enabled,
        LBTCError::WithdrawalsDisabled
    );
    require!(
        ctx.accounts.treasury.key() == ctx.accounts.config.treasury,
        LBTCError::InvalidTreasury
    );

    let fee = ctx.accounts.config.burn_commission;
    let dust_limit = bitcoin_utils::get_dust_limit_for_output(
        &script_pubkey,
        ctx.accounts.config.dust_fee_rate,
    )?;
    require!(amount > fee, LBTCError::FeeGTEAmount);
    require!(amount - fee > dust_limit, LBTCError::AmountBelowDustLimit);

    utils::execute_burn(
        ctx.accounts.token_program.to_account_info(),
        ctx.accounts.payer.to_account_info(),
        amount,
        ctx.accounts.token_mint.to_account_info(),
        ctx.accounts.token_authority.to_account_info(),
        ctx.bumps.token_authority,
    )?;
    utils::execute_mint(
        ctx.accounts.token_program.to_account_info(),
        ctx.accounts.treasury.to_account_info(),
        fee,
        ctx.accounts.token_mint.to_account_info(),
        ctx.accounts.token_authority.to_account_info(),
        ctx.bumps.token_authority,
    )?;

    emit!(UnstakeRequest {
        from: ctx.accounts.payer.key(),
        script_pubkey,
        amount,
    });
    Ok(())
}
