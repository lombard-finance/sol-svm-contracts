//! Native redeem functionality for LBTC.
use crate::{
    errors::LBTCError,
    events::UnstakeRequest,
    state::Config,
    utils::{self, bitcoin_utils},
};
use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};

#[derive(Accounts)]
pub struct Redeem<'info> {
    pub payer: Signer<'info>,
    #[account(
        mut,
        token::mint = mint,
        token::authority = payer,
        token::token_program = token_program,
    )]
    pub recipient: InterfaceAccount<'info, TokenAccount>,
    pub config: Account<'info, Config>,
    pub token_program: Interface<'info, TokenInterface>,
    pub mint: InterfaceAccount<'info, Mint>,
    #[account(mut, address = config.treasury)]
    pub treasury: InterfaceAccount<'info, TokenAccount>,
}

pub fn redeem(ctx: Context<Redeem>, script_pubkey: Vec<u8>, amount: u64) -> Result<()> {
    require!(!ctx.accounts.config.paused, LBTCError::Paused);
    require!(
        ctx.accounts.config.withdrawals_enabled,
        LBTCError::WithdrawalsDisabled
    );

    let fee = ctx.accounts.config.burn_commission;
    let dust_limit = bitcoin_utils::get_dust_limit_for_output(
        &script_pubkey,
        ctx.accounts.config.dust_fee_rate,
    )?;
    require!(amount > fee, LBTCError::FeeGTEAmount);
    require!(amount - fee > dust_limit, LBTCError::AmountBelowDustLimit);

    anchor_spl::token_interface::transfer(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            anchor_spl::token_interface::Transfer {
                from: ctx.accounts.recipient.to_account_info(),
                to: ctx.accounts.treasury.to_account_info(),
                authority: ctx.accounts.payer.to_account_info(),
            },
        ),
        fee,
    )?;

    utils::execute_burn(
        ctx.accounts.token_program.to_account_info(),
        ctx.accounts.payer.to_account_info(),
        amount - fee,
        ctx.accounts.mint.to_account_info(),
        ctx.accounts.payer.to_account_info(),
    )?;

    emit!(UnstakeRequest {
        from: ctx.accounts.payer.key(),
        script_pubkey,
        amount,
    });
    Ok(())
}
