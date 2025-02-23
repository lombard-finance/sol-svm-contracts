//! Minting functionality from a notarized payload where Lombard pays for the transaction fee, in
//! return for a small rebate in LBTC.
use crate::{
    errors::LBTCError,
    state::{Config, MintPayload, Used},
    utils::{self, validation},
};
use anchor_lang::prelude::*;
use anchor_spl::token_interface::{TokenAccount, TokenInterface};

#[derive(Accounts)]
#[instruction(mint_payload_hash: Vec<u8>)]
pub struct MintWithFee<'info> {
    pub payer: Signer<'info>,
    pub config: Account<'info, Config>,
    pub token_program: Interface<'info, TokenInterface>,
    pub recipient: InterfaceAccount<'info, TokenAccount>,
    pub token_mint: InterfaceAccount<'info, TokenAccount>,
    #[account(
        seeds = [crate::constants::TOKEN_AUTHORITY_SEED],
        bump,
    )]
    pub token_authority: InterfaceAccount<'info, TokenAccount>,
    pub treasury: InterfaceAccount<'info, TokenAccount>,
    #[account(mut, seeds = [&mint_payload_hash], bump)]
    pub used: Account<'info, Used>,
    #[account(mut, close = recipient, seeds = [&mint_payload_hash], bump)]
    pub payload: Account<'info, MintPayload>,
    /// CHECK: This can be left empty in case of bascule being disabled, so we forego the check
    /// here.
    pub bascule: UncheckedAccount<'info>,
}

pub fn mint_with_fee(
    ctx: Context<MintWithFee>,
    mint_payload_hash: [u8; 32],
    fee_payload: Vec<u8>,
    fee_signature: [u8; 64],
) -> Result<()> {
    require!(!ctx.accounts.config.paused, LBTCError::Paused);
    require!(
        ctx.accounts
            .config
            .claimers
            .iter()
            .any(|&claimer| claimer == ctx.accounts.payer.key()),
        LBTCError::Unauthorized
    );

    let amount = validation::validate_mint(
        &ctx.accounts.config,
        &ctx.accounts.recipient,
        &mut ctx.accounts.used,
        &ctx.accounts.payload.payload,
        ctx.accounts.payload.weight,
        mint_payload_hash,
    )?;

    let fee = validation::validate_fee(
        &ctx.accounts.config,
        *ctx.program_id,
        &ctx.accounts.recipient.to_account_info(),
        fee_payload,
        fee_signature,
    )?;
    require!(fee < amount, LBTCError::FeeGTEAmount);

    utils::execute_mint(
        ctx.accounts.token_program.to_account_info(),
        ctx.accounts.treasury.to_account_info(),
        fee,
        ctx.accounts.token_mint.to_account_info(),
        ctx.accounts.token_authority.to_account_info(),
        ctx.bumps.token_authority,
    )?;
    utils::execute_mint(
        ctx.accounts.token_program.to_account_info(),
        ctx.accounts.recipient.to_account_info(),
        amount - fee,
        ctx.accounts.token_mint.to_account_info(),
        ctx.accounts.token_authority.to_account_info(),
        ctx.bumps.token_authority,
    )
}
