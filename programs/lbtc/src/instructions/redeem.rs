//! Native redeem functionality for LBTC.
use crate::{
    constants,
    errors::LBTCError,
    events::UnstakeRequest,
    state::{Config, UnstakeInfo},
    utils::{self, bitcoin_utils},
};
use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};

#[derive(Accounts)]
pub struct Redeem<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(
        mut,
        token::mint = mint,
        token::authority = payer,
        token::token_program = token_program,
    )]
    pub holder: InterfaceAccount<'info, TokenAccount>,
    #[account(mut, seeds = [constants::CONFIG_SEED], bump)]
    pub config: Account<'info, Config>,
    pub token_program: Interface<'info, TokenInterface>,
    #[account(mut, address = config.mint)]
    pub mint: InterfaceAccount<'info, Mint>,
    #[account(mut, address = config.treasury)]
    pub treasury: InterfaceAccount<'info, TokenAccount>,
    #[account(
        init,
        seeds = [&config.unstake_counter.to_le_bytes()],
        bump,
        payer = payer,
        space = 8 + UnstakeInfo::INIT_SPACE
    )]
    pub unstake_info: Account<'info, UnstakeInfo>,
    pub system_program: Program<'info, System>,
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

    anchor_spl::token_interface::transfer_checked(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            anchor_spl::token_interface::TransferChecked {
                from: ctx.accounts.holder.to_account_info(),
                to: ctx.accounts.treasury.to_account_info(),
                authority: ctx.accounts.payer.to_account_info(),
                mint: ctx.accounts.mint.to_account_info(),
            },
        ),
        fee,
        constants::LBTC_DECIMALS,
    )?;

    utils::execute_burn(
        ctx.accounts.token_program.to_account_info(),
        ctx.accounts.holder.to_account_info(),
        amount - fee,
        ctx.accounts.mint.to_account_info(),
        ctx.accounts.payer.to_account_info(),
    )?;

    ctx.accounts.unstake_info.from = ctx.accounts.holder.key();
    ctx.accounts.unstake_info.script_pubkey = script_pubkey.clone();
    ctx.accounts.unstake_info.amount = amount - fee;
    ctx.accounts.config.unstake_counter += 1;

    emit!(UnstakeRequest {
        from: ctx.accounts.holder.key(),
        script_pubkey,
        amount: amount - fee,
    });
    Ok(())
}
