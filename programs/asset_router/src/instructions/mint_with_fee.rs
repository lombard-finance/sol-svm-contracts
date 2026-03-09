//! Minting functionality from a notarized payload (session payload from consortium) with fee.
use anchor_lang::prelude::*;
use anchor_lang::solana_program::hash::hash as sha256;
use anchor_lang::solana_program::sysvar::instructions;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};

use bascule::{
    cpi::{accounts::Validator, validate_withdrawal},
    to_deposit_id,
};
use consortium::{
    constants::VALIDATED_PAYLOAD_SEED,
    state::{SessionPayload, ValidatedPayload},
};

use crate::constants::{
    ACCOUNT_ROLES_SEED, BASCULE_VALIDATOR_SEED, CHAIN_ID, CONFIG_SEED, DEPOSIT_PAYLOAD_SPENT_SEED,
    TOKEN_CONFIG_SEED,
};
use crate::state::{AccountRole, AccountRoles, DepositPayloadSpent, TokenConfig};
use crate::utils::consortium_payloads::{DepositV1, DEPOSIT_V1_PAYLOAD_LEN};
use crate::utils::fee::{FeeAction, FEE_PAYLOAD_LEN};
use crate::{
    errors::AssetRouterError,
    events::MintProofConsumed,
    state::Config,
    utils,
};

#[derive(Accounts)]
#[instruction(mint_payload_hash: [u8; 32])]
pub struct MintWithFee<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(
        constraint = !config.paused @ AssetRouterError::Paused,
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

    /// Session payload posted via consortium (payload and hash validated in handler).
    /// CHECK: no matter who is owner of this account as long as its data matches the payload hash.
    /// Generally this will be created via post_session_payload instruction of the consortium program.
    pub session_payload: UncheckedAccount<'info>,

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

    // Optional bascule (same pattern as mint_from_payload)
    #[account(seeds = [BASCULE_VALIDATOR_SEED], bump)]
    pub bascule_validator: Option<UncheckedAccount<'info>>,
    /// CHECK: When bascule is enabled, validated in handler.
    pub bascule_program: Option<UncheckedAccount<'info>>,
    /// CHECK: When bascule is enabled, validated in handler.
    #[account(mut)]
    pub bascule_data: Option<UncheckedAccount<'info>>,
    /// CHECK: When bascule is enabled, validated in handler.
    #[account(mut)]
    pub bascule_deposit: Option<UncheckedAccount<'info>>,
}

pub fn mint_with_fee(
    ctx: Context<MintWithFee>,
    mint_payload_hash: [u8; 32],
    fee_payload: [u8; FEE_PAYLOAD_LEN],
    fee_signature: [u8; 64],
) -> Result<()> {
    let config = &ctx.accounts.config;

    let session_payload_data = ctx.accounts.session_payload.try_borrow_data()?;
    let session_payload = SessionPayload::try_deserialize(&mut session_payload_data.iter().as_slice())?;

    let computed_mint_payload_hash = sha256(&session_payload.payload).to_bytes();
    require!(
        computed_mint_payload_hash == mint_payload_hash,
        AssetRouterError::MintPayloadHashMismatch
    );

    // Validate the deposit payload
    let deposit_payload = DepositV1::from_session_payload(&session_payload.payload)?;
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

    // Bascule: when configured, validate withdrawal (same as mint_from_payload)
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
