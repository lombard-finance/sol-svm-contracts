//! Minting functionality from a notarized payload.
use crate::{
    constants::CONFIG_SEED,
    errors::LBTCError,
    events::MintProofConsumed,
    state::{Config, MintPayload},
    utils::{self, validation},
};
use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};

#[derive(Accounts)]
#[instruction(mint_payload_hash: [u8; 32])]
pub struct MintFromPayload<'info> {
    #[account(seeds = [CONFIG_SEED], bump)]
    pub config: Account<'info, Config>,
    pub token_program: Interface<'info, TokenInterface>,
    #[account(
        mut,
        token::mint = mint,
        token::token_program = token_program,
    )]
    pub recipient: InterfaceAccount<'info, TokenAccount>,
    #[account(mut, address = config.mint)]
    pub mint: InterfaceAccount<'info, Mint>,
    /// CHECK: The seeds constraint ensures the correct address is passed.
    #[account(seeds = [crate::constants::TOKEN_AUTHORITY_SEED], bump)]
    pub token_authority: UncheckedAccount<'info>,
    #[account(mut, seeds = [&mint_payload_hash], bump)]
    pub payload: Account<'info, MintPayload>,
    /// CHECK: We constrain this to config-set bascule.
    #[account(constraint = bascule.key() == config.bascule)]
    pub bascule: UncheckedAccount<'info>,
    /// CHECK: This is validated in Bascule.
    pub bascule_data: UncheckedAccount<'info>,
    /// CHECK: This is validated in Bascule.
    pub deposit: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

pub fn mint_from_payload(ctx: Context<MintFromPayload>, mint_payload_hash: [u8; 32]) -> Result<()> {
    require!(!ctx.accounts.config.paused, LBTCError::Paused);
    require!(!ctx.accounts.payload.minted, LBTCError::MintPayloadUsed);
    let amount = validation::post_validate_mint(
        &ctx.accounts.config,
        ctx.bumps.config,
        &ctx.accounts.recipient,
        &ctx.accounts.payload.payload,
        ctx.accounts.payload.weight,
        &ctx.accounts.bascule,
        &ctx.accounts.bascule_data,
        &ctx.accounts.deposit,
        &ctx.accounts.system_program,
    )?;

    ctx.accounts.payload.minted = true;
    emit!(MintProofConsumed {
        recipient: ctx.accounts.recipient.key(),
        payload_hash: mint_payload_hash,
    });
    utils::execute_mint(
        ctx.accounts.token_program.to_account_info(),
        ctx.accounts.recipient.to_account_info(),
        amount,
        ctx.accounts.mint.to_account_info(),
        ctx.accounts.token_authority.to_account_info(),
        ctx.bumps.token_authority,
    )
}
