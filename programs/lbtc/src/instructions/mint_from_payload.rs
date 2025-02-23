//! Minting functionality from a notarized payload.
use crate::{
    errors::LBTCError,
    state::{Config, MintPayload, Used},
    utils::{self, validation},
};
use anchor_lang::prelude::*;
use anchor_spl::token_interface::{self, TokenAccount, TokenInterface};

#[derive(Accounts)]
#[instruction(mint_payload_hash: Vec<u8>)]
pub struct MintFromPayload<'info> {
    pub config: Account<'info, Config>,
    pub token_program: Interface<'info, TokenInterface>,
    pub recipient: InterfaceAccount<'info, TokenAccount>,
    pub token_mint: InterfaceAccount<'info, TokenAccount>,
    #[account(
        seeds = [crate::constants::TOKEN_AUTHORITY_SEED],
        bump,
    )]
    pub token_authority: InterfaceAccount<'info, TokenAccount>,
    #[account(mut, seeds = [&mint_payload_hash], bump)]
    pub used: Account<'info, Used>,
    #[account(mut, close = recipient, seeds = [&mint_payload_hash], bump)]
    pub payload: Account<'info, MintPayload>,
    /// CHECK: This can be left empty in case of bascule being disabled, so we forego the check
    /// here.
    pub bascule: UncheckedAccount<'info>,
}

pub fn mint_from_payload(ctx: Context<MintFromPayload>, mint_payload_hash: [u8; 32]) -> Result<()> {
    require!(!ctx.accounts.config.paused, LBTCError::Paused);
    let amount = validation::validate_mint(
        &ctx.accounts.config,
        &ctx.accounts.recipient,
        &mut ctx.accounts.used,
        &ctx.accounts.payload.payload,
        ctx.accounts.payload.weight,
        mint_payload_hash,
    )?;

    utils::execute_mint(
        ctx.accounts.token_program.to_account_info(),
        ctx.accounts.recipient.to_account_info(),
        amount,
        ctx.accounts.token_mint.to_account_info(),
        ctx.accounts.token_authority.to_account_info(),
        ctx.bumps.token_authority,
    )
}
