//! Minting functionality from a notarized payload.
use anchor_lang::prelude::*;
use anchor_lang::solana_program::hash::hash as sha256;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};

use consortium::{constants::VALIDATED_PAYLOAD_SEED, state::ValidatedPayload};

use crate::state::DepositPayloadSpent;
use crate::utils::consortium_payloads::{DepositV1, DEPOSIT_V1_PAYLOAD_LEN};
use crate::{
    constants::{CHAIN_ID, CONFIG_SEED, DEPOSIT_PAYLOAD_SPENT_SEED},
    errors::AssetRouterError,
    events::MintProofConsumed,
    state::Config,
    utils,
};

#[derive(Accounts)]
#[instruction(mint_payload: [u8; DEPOSIT_V1_PAYLOAD_LEN], mint_payload_hash: [u8; 32])]
pub struct MintFromPayload<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(
        constraint = !config.paused @ AssetRouterError::Paused,
        constraint = !config.bascule_enabled @ AssetRouterError::BasculeNotAvailable,
        seeds = [CONFIG_SEED],
        bump
    )]
    pub config: Account<'info, Config>,

    // Token mint related accounts
    pub token_program: Interface<'info, TokenInterface>,
    #[account(
        mut,
        token::mint = mint,
        token::token_program = token_program,
    )]
    pub recipient: InterfaceAccount<'info, TokenAccount>,
    #[account(mut, address = config.native_mint)]
    pub mint: InterfaceAccount<'info, Mint>,
    /// CHECK: This being used in the mint call constrains it to be correct, otherwise the
    /// instruction will fail.
    pub mint_authority: UncheckedAccount<'info>,
    /// CHECK: The seeds constraint ensures the correct address is passed.
    #[account(seeds = [crate::constants::TOKEN_AUTHORITY_SEED], bump)]
    pub token_authority: UncheckedAccount<'info>,

    /// check that the consortium program has validated the payload
    #[account(
        seeds = [VALIDATED_PAYLOAD_SEED, &mint_payload_hash[..]],
        seeds::program = consortium::ID,
        bump
    )]
    pub consortium_validated_payload: Account<'info, ValidatedPayload>,

    #[account(
        init,
        space = 8, // struct has no fields
        payer = payer,
        seeds = [DEPOSIT_PAYLOAD_SPENT_SEED, &mint_payload_hash[..]],
        bump,
    )]
    pub deposit_payload_spent: Account<'info, DepositPayloadSpent>,

    pub system_program: Program<'info, System>,
}

pub fn mint_from_payload(
    ctx: Context<MintFromPayload>,
    mint_payload: [u8; DEPOSIT_V1_PAYLOAD_LEN],
    mint_payload_hash: [u8; 32],
) -> Result<()> {
    let config = &mut ctx.accounts.config;

    require!(
        mint_payload_hash == sha256(&mint_payload).to_bytes(),
        AssetRouterError::MintPayloadHashMismatch
    );

    // Validate the deposit payload
    let deposit_payload = DepositV1::from_session_payload(&mint_payload)?;
    // must have this chain as destination
    require!(
        deposit_payload.destination_chain_id == CHAIN_ID,
        AssetRouterError::InvalidChainID
    );
    // native mint is the only token that can be directly minted with a deposit payload
    require!(
        deposit_payload.token_address == config.native_mint.to_bytes(),
        AssetRouterError::InvalidTokenAddress
    );
    // recipient must match the recipient in the deposit payload
    require!(
        deposit_payload.recipient == ctx.accounts.recipient.key().to_bytes(),
        AssetRouterError::RecipientMismatch
    );

    emit!(MintProofConsumed {
        recipient: ctx.accounts.recipient.key(),
        payload_hash: mint_payload_hash,
    });

    utils::execute_mint(
        ctx.accounts.token_program.to_account_info(),
        ctx.accounts.recipient.to_account_info(),
        deposit_payload.amount,
        ctx.accounts.mint.to_account_info(),
        ctx.accounts.mint_authority.to_account_info(),
        ctx.accounts.token_authority.to_account_info(),
        ctx.bumps.token_authority,
    )
}
