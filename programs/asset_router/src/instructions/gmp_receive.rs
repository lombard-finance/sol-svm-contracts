use anchor_lang::prelude::*;
use anchor_spl::{associated_token, token_interface::{Mint as TokenMint, TokenAccount, TokenInterface}};
use anchor_lang::solana_program::hash::hash as sha256;

use bascule_gmp::{
    cpi::{accounts::ValidateMint, validate_mint},
    state::MintMessage,
};
use mailbox::{constants::MESSAGE_SEED, state::MessageV1Info};

use crate::{
    constants::{BASCULE_VALIDATOR_SEED, BTC_STAKING_MODULE_ADDRESS, CONFIG_SEED, MESSAGE_HANDLED_SEED},
    errors::AssetRouterError,
    state::{Config, MessageHandled},
    utils::{self, gmp_messages::Mint},
};

#[derive(Accounts)]
#[instruction(payload_hash: [u8; 32])]
pub struct GMPReceive<'info> {
    // The PDA from the mailbox program that contains the message.
    // Checking this account is signer ensures the message legitimately comes from the mailbox program.
    #[account(
        signer,
        owner = config.mailbox,
        seeds = [MESSAGE_SEED, &payload_hash],
        seeds::program = config.mailbox,
        bump,
    )]
    pub message_info: Account<'info, MessageV1Info>,

    // any other account needed to handle the message
    #[account(mut)]
    pub handler: Signer<'info>,

    #[account(
        constraint = !config.paused @ AssetRouterError::Paused,
        seeds = [CONFIG_SEED],
        bump
    )]
    pub config: Account<'info, Config>,

    // This account is used to track which messages have been handled to avoid handling them again
    // while generally not necessary because the mailbox program already ensures this, we prefer to
    // add and extra check here as additional safeguard.
    #[account(
        init,
        payer = handler,
        space = 8 + MessageHandled::INIT_SPACE,
        seeds = [MESSAGE_HANDLED_SEED, &payload_hash],
        bump,
    )]
    pub message_handled: Account<'info, MessageHandled>,

    // Token mint related accounts
    pub token_program: Interface<'info, TokenInterface>,
    #[account(
        mut,
        token::mint = mint,
        token::token_program = token_program,
    )]
    pub recipient: InterfaceAccount<'info, TokenAccount>,
    pub mint: InterfaceAccount<'info, TokenMint>,
    /// CHECK: This being used in the mint call constrains it to be correct, otherwise the
    /// instruction will fail.
    pub mint_authority: UncheckedAccount<'info>,
    /// CHECK: The seeds constraint ensures the correct address is passed.
    #[account(seeds = [crate::constants::TOKEN_AUTHORITY_SEED], bump)]
    pub token_authority: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,

    #[account(mut, seeds = [BASCULE_VALIDATOR_SEED], bump)]
    pub bascule_validator: Option<UncheckedAccount<'info>>,
    /// When config.bascule_gmp is Some, must be the bascule_gmp program; otherwise optional.
    /// CHECK: instruction body constrains it to have correct configured address.
    pub bascule_gmp_program: Option<UncheckedAccount<'info>>,
    /// When config.bascule_gmp is Some, must be bascule_gmp config PDA; otherwise optional.
    /// CHECK: bascule validates it
    pub bascule_gmp_config: Option<UncheckedAccount<'info>>,
    /// When config.bascule_gmp is Some, must be bascule_gmp account_roles for config; otherwise optional.
    /// CHECK: bascule validates account_roles PDA.
    pub bascule_gmp_account_roles: Option<UncheckedAccount<'info>>,
    /// When config.bascule_gmp is Some, must be bascule_gmp mint_payload PDA; otherwise optional.
    /// CHECK: bascule validates mint_payload PDA.
    #[account(mut)]
    pub bascule_gmp_mint_payload: Option<UncheckedAccount<'info>>,
}

pub fn gmp_receive(ctx: Context<GMPReceive>, payload_hash: [u8; 32]) -> Result<()> {
    let message_info = &ctx.accounts.message_info;

    let computed_payload_hash = sha256(&message_info.message.to_session_payload()).to_bytes();
    require!(
        computed_payload_hash == payload_hash,
        AssetRouterError::InvalidPayloadHash
    );
    
    require!(
        ctx.accounts.message_info.message.sender == BTC_STAKING_MODULE_ADDRESS,
        AssetRouterError::InvalidMessageSender
    );

    let mint_message = Mint::from_message(&ctx.accounts.message_info.message.body)?;

    // the following checks could be omitted and cause and error later on directly when
    // executing the mint instruction, but here we have a better error message
    require!(
        mint_message.token_address == ctx.accounts.mint.key().to_bytes(),
        AssetRouterError::InvalidTokenAddress
    );
    let recipient_derived_token_account = associated_token::get_associated_token_address_with_program_id(
        &Pubkey::new_from_array(mint_message.recipient),
        &ctx.accounts.mint.key(),
        &ctx.accounts.token_program.key(),
     );
    require!(
        mint_message.recipient == ctx.accounts.recipient.key().to_bytes()
            || (ctx.accounts.recipient.key() == recipient_derived_token_account
                && ctx.accounts.recipient.owner.key().to_bytes() == mint_message.recipient),
        AssetRouterError::RecipientMismatch
    );
    require!(mint_message.amount > 0, AssetRouterError::ZeroAmount);

    // When bascule_gmp is configured, validate mint (message must be reported when above threshold).
    if let Some(bascule_gmp_id) = ctx.accounts.config.bascule_gmp {
        let bascule_gmp_address = ctx
            .accounts
            .bascule_gmp_program
            .as_ref()
            .ok_or(AssetRouterError::MissingBasculeAccount)?;
        require!(
            bascule_gmp_address.key() == bascule_gmp_id,
            AssetRouterError::InvalidBasculeProgram
        );
        let bascule_gmp_config = ctx
            .accounts
            .bascule_gmp_config
            .as_ref()
            .ok_or(AssetRouterError::MissingBasculeAccount)?;
        let bascule_gmp_account_roles = ctx
            .accounts
            .bascule_gmp_account_roles
            .as_ref()
            .ok_or(AssetRouterError::MissingBasculeAccount)?;
        let bascule_gmp_mint_payload = ctx
            .accounts
            .bascule_gmp_mint_payload
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
        
        let mint_message = MintMessage {
            nonce: ctx.accounts.message_info.message.nonce,
            token_address: mint_message.token_address,
            recipient: mint_message.recipient,
            amount: mint_message.amount,
        };
        let signer_seeds: &[&[&[u8]]] = &[&[BASCULE_VALIDATOR_SEED, &[bascule_validator_bump]]];
        validate_mint(
            CpiContext::new_with_signer(
                bascule_gmp_address.to_account_info(),
                ValidateMint {
                    validator: bascule_validator.to_account_info(),
                    payer: ctx.accounts.handler.to_account_info(),
                    config: bascule_gmp_config.to_account_info(),
                    account_roles: bascule_gmp_account_roles.to_account_info(),
                    mint_payload: bascule_gmp_mint_payload.to_account_info(),
                    system_program: ctx.accounts.system_program.to_account_info(),
                },
                signer_seeds,
            ),
            mint_message,
        )?;
    }

    utils::execute_mint(
        ctx.accounts.token_program.to_account_info(),
        ctx.accounts.recipient.to_account_info(),
        mint_message.amount,
        ctx.accounts.mint.to_account_info(),
        ctx.accounts.mint_authority.to_account_info(),
        ctx.accounts.token_authority.to_account_info(),
        ctx.bumps.token_authority,
    )?;

    Ok(())
}
