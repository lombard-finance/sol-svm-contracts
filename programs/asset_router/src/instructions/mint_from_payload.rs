//! Minting functionality from a notarized payload.
use anchor_lang::prelude::*;
use anchor_lang::solana_program::hash::hash as sha256;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};

use bascule::{
    cpi::{accounts::Validator, validate_withdrawal},
    to_deposit_id,
};
use consortium::{constants::VALIDATED_PAYLOAD_SEED, state::ValidatedPayload};

use crate::state::DepositPayloadSpent;
use crate::utils::consortium_payloads::{DepositV1, DEPOSIT_V1_PAYLOAD_LEN};
use crate::{
    constants::{BASCULE_VALIDATOR_SEED, CHAIN_ID, CONFIG_SEED, DEPOSIT_PAYLOAD_SPENT_SEED},
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
        owner = config.consortium,
        seeds = [VALIDATED_PAYLOAD_SEED, &mint_payload_hash[..]],
        seeds::program = config.consortium,
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

    #[account(seeds = [BASCULE_VALIDATOR_SEED], bump)]
    pub bascule_validator: Option<UncheckedAccount<'info>>,
    /// When config.bascule is Some, must be the bascule program; otherwise optional.
    /// CHECK: instruction body constrains it to have correct configured address.
    pub bascule_program: Option<UncheckedAccount<'info>>,
    /// When config.bascule is Some, must be bascule's BasculeData PDA; otherwise optional.
    /// CHECK: bascule validates it
    #[account(mut)]
    pub bascule_data: Option<UncheckedAccount<'info>>,
    /// When config.bascule is Some, must be bascule deposit PDA for this payload; otherwise optional.
    /// CHECK: bascule validates it
    #[account(mut)]
    pub bascule_deposit: Option<UncheckedAccount<'info>>,
}

pub fn mint_from_payload(
    ctx: Context<MintFromPayload>,
    mint_payload: [u8; DEPOSIT_V1_PAYLOAD_LEN],
    mint_payload_hash: [u8; 32],
) -> Result<()> {
    let config = &ctx.accounts.config;

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

    // When bascule is configured, validate withdrawal (payload must be reported when above threshold).
    if let Some(bascule_program_id) = config.bascule {
        let bascule_program = ctx
            .accounts
            .bascule_program
            .as_ref()
            .ok_or(AssetRouterError::MissingBasculeAccount)?;
        require!(
            bascule_program.key() == bascule_program_id,
            AssetRouterError::InvalidBasculeProgram
        );
        let bascule_data = ctx
            .accounts
            .bascule_data
            .as_ref()
            .ok_or(AssetRouterError::MissingBasculeAccount)?;
        let bascule_deposit = ctx
            .accounts
            .bascule_deposit
            .as_ref()
            .ok_or(AssetRouterError::MissingBasculeAccount)?;
        let bascule_validator = ctx
            .accounts
            .bascule_validator
            .as_ref()
            .ok_or(AssetRouterError::MissingBasculeAccount)?;
        let bascule_validator_bump = ctx
            .bumps
            .bascule_validator
            .ok_or(AssetRouterError::MissingBasculeAccount)?;
        let recipient_pubkey = Pubkey::new_from_array(deposit_payload.recipient);
        let deposit_id = to_deposit_id(
            recipient_pubkey,
            deposit_payload.amount,
            deposit_payload.txid,
            deposit_payload.vout,
        );
        let signer_seeds: &[&[&[u8]]] = &[&[BASCULE_VALIDATOR_SEED, &[bascule_validator_bump]]];
        validate_withdrawal(
            CpiContext::new_with_signer(
                bascule_program.to_account_info(),
                Validator {
                    validator: bascule_validator.to_account_info(),
                    payer: ctx.accounts.payer.to_account_info(),
                    bascule_data: bascule_data.to_account_info(),
                    deposit: bascule_deposit.to_account_info(),
                    system_program: ctx.accounts.system_program.to_account_info(),
                },
                signer_seeds,
            ),
            deposit_id,
            recipient_pubkey,
            deposit_payload.amount,
            deposit_payload.txid,
            deposit_payload.vout,
        )?;
    }

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
