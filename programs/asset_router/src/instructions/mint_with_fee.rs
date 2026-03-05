//! Minting functionality from a notarized payload.
use anchor_lang::prelude::*;
use anchor_lang::solana_program::hash::hash as sha256;
use anchor_lang::solana_program::sysvar::instructions;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};

use consortium::{constants::VALIDATED_PAYLOAD_SEED, state::ValidatedPayload};

use crate::constants::{ACCOUNT_ROLES_SEED, TOKEN_CONFIG_SEED};
use crate::state::{AccountRole, AccountRoles, DepositPayloadSpent, TokenConfig};
use crate::utils::consortium_payloads::{DepositV1, DEPOSIT_V1_PAYLOAD_LEN};
use crate::utils::fee::{FeeAction, FEE_PAYLOAD_LEN};
use crate::{
    constants::{CHAIN_ID, CONFIG_SEED, DEPOSIT_PAYLOAD_SPENT_SEED},
    errors::AssetRouterError,
    events::MintProofConsumed,
    state::Config,
    utils,
};

#[derive(Accounts)]
#[instruction(mint_payload: [u8; DEPOSIT_V1_PAYLOAD_LEN], mint_payload_hash: [u8; 32])]
pub struct MintWithFee<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(
        constraint = !config.paused @ AssetRouterError::Paused,
        constraint = !config.bascule_enabled @ AssetRouterError::BasculeNotAvailable,
        seeds = [CONFIG_SEED],
        bump
    )]
    pub config: Account<'info, Config>,

    #[account(
        constraint = account_roles.has_role(AccountRole::Claimer) @ AssetRouterError::Unauthorized,
        seeds = [ACCOUNT_ROLES_SEED, payer.key().as_ref()],
        bump
    )]
    pub account_roles: Account<'info, AccountRoles>,

    #[account(seeds = [TOKEN_CONFIG_SEED, mint.key().as_ref()], bump)]
    pub token_config: Account<'info, TokenConfig>,

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

    #[account(
        mut,
        token::mint = mint,
        token::authority = config.treasury,
        token::token_program = token_program,
    )]
    pub treasury_token_account: InterfaceAccount<'info, TokenAccount>,

    /// CHECK: This is used to verify the instruction to verify the fee signature is present
    #[account(address = instructions::ID)]
    pub instruction_sysvar: UncheckedAccount<'info>,
}

pub fn mint_with_fee(
    ctx: Context<MintWithFee>,
    mint_payload: [u8; DEPOSIT_V1_PAYLOAD_LEN],
    mint_payload_hash: [u8; 32],
    fee_payload: [u8; FEE_PAYLOAD_LEN],
    fee_signature: [u8; 64],
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

    let mut amount = deposit_payload.amount;

    // verify signature
    utils::ed25519::verify_ed25519_instruction(
        &ctx.accounts.instruction_sysvar.to_account_info(),
        &ctx.accounts.recipient.owner.to_bytes(),
        &fee_payload,
        &fee_signature,
    )?;

    let fee_action = FeeAction::from_bytes(&fee_payload)?;

    let fee = fee_action.validate_fee(ctx.accounts.token_config.max_mint_commission)?;
    require!(fee < amount, AssetRouterError::FeeGTEAmount);
    amount -= fee;

    // mint fee to treasury
    utils::execute_mint(
        ctx.accounts.token_program.to_account_info(),
        ctx.accounts.treasury_token_account.to_account_info(),
        fee,
        ctx.accounts.mint.to_account_info(),
        ctx.accounts.mint_authority.to_account_info(),
        ctx.accounts.token_authority.to_account_info(),
        ctx.bumps.token_authority,
    )?;

    // mint amount to recipient
    utils::execute_mint(
        ctx.accounts.token_program.to_account_info(),
        ctx.accounts.recipient.to_account_info(),
        amount,
        ctx.accounts.mint.to_account_info(),
        ctx.accounts.mint_authority.to_account_info(),
        ctx.accounts.token_authority.to_account_info(),
        ctx.bumps.token_authority,
    )?;

    emit!(MintProofConsumed {
        recipient: ctx.accounts.recipient.key(),
        payload_hash: mint_payload_hash,
    });

    Ok(())
}
