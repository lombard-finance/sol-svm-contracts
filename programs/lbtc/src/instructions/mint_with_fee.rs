//! Minting functionality from a notarized payload where Lombard pays for the transaction fee, in
//! return for a small rebate in LBTC.
use crate::{
    constants::{CONFIG_SEED, FEE_PAYLOAD_LEN},
    errors::LBTCError,
    events::MintProofConsumed,
    state::{Config, MintPayload},
    utils::{self, validation},
};
use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};

#[derive(Accounts)]
#[instruction(mint_payload_hash: [u8; 32])]
pub struct MintWithFee<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump)]
    pub config: Account<'info, Config>,
    pub token_program: Interface<'info, TokenInterface>,
    /// CHECK: This will be verified by the token authority on recipient.
    pub recipient_auth: UncheckedAccount<'info>,
    #[account(
        mut,
        token::mint = mint,
        token::authority = recipient_auth,
        token::token_program = token_program,
    )]
    pub recipient: InterfaceAccount<'info, TokenAccount>,
    #[account(mut, address = config.mint)]
    pub mint: InterfaceAccount<'info, Mint>,
    /// CHECK: This being used in the mint call constrains it to be correct, otherwise the
    /// instruction will fail.
    pub mint_authority: UncheckedAccount<'info>,
    /// CHECK: The seeds constraint ensures the correct address is passed.
    #[account(seeds = [crate::constants::TOKEN_AUTHORITY_SEED], bump)]
    pub token_authority: UncheckedAccount<'info>,
    #[account(mut, address = config.treasury)]
    pub treasury: InterfaceAccount<'info, TokenAccount>,
    #[account(mut, seeds = [&mint_payload_hash], bump)]
    pub payload: Account<'info, MintPayload>,
    /// CHECK: We constrain this to config-set bascule.
    #[account(constraint = bascule.key() == config.bascule)]
    pub bascule: UncheckedAccount<'info>,
    /// CHECK: This is validated in Bascule.
    pub bascule_data: UncheckedAccount<'info>,
    /// CHECK: This is validated in Bascule.
    #[account(mut)]
    pub deposit: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

pub fn mint_with_fee(
    ctx: Context<MintWithFee>,
    mint_payload_hash: [u8; 32],
    fee_payload: [u8; FEE_PAYLOAD_LEN],
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
    require!(!ctx.accounts.payload.minted, LBTCError::MintPayloadUsed);

    let amount = validation::post_validate_mint(
        &ctx.accounts.payer,
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

    let fee = validation::validate_fee(
        &ctx.accounts.config,
        *ctx.program_id,
        &ctx.accounts.recipient_auth.to_account_info(),
        fee_payload,
        fee_signature,
    )?;
    require!(fee < amount, LBTCError::FeeGTEAmount);

    ctx.accounts.payload.minted = true;
    emit!(MintProofConsumed {
        recipient: ctx.accounts.recipient.key(),
        payload_hash: mint_payload_hash,
    });
    utils::execute_mint(
        ctx.accounts.token_program.to_account_info(),
        ctx.accounts.treasury.to_account_info(),
        fee,
        ctx.accounts.mint.to_account_info(),
        ctx.accounts.mint_authority.to_account_info(),
        ctx.bumps.token_authority,
    )?;
    utils::execute_mint(
        ctx.accounts.token_program.to_account_info(),
        ctx.accounts.recipient.to_account_info(),
        amount - fee,
        ctx.accounts.mint.to_account_info(),
        ctx.accounts.mint_authority.to_account_info(),
        ctx.bumps.token_authority,
    )
}
