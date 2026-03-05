use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint as TokenMint, TokenAccount, TokenInterface};

use mailbox::{constants::MESSAGE_SEED, state::MessageV1Info};

use crate::{
    constants::{BTC_STAKING_MODULE_ADDRESS, CONFIG_SEED, MESSAGE_HANDLED_SEED},
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
        seeds = [MESSAGE_SEED, &payload_hash],
        seeds::program = config.mailbox,
        bump,
    )]
    pub message_info: Account<'info, MessageV1Info>,

    // any other account needed to handle the message
    #[account(mut)]
    pub handler: Signer<'info>,

    #[account(seeds = [CONFIG_SEED], bump)]
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
}

pub fn gmp_receive(ctx: Context<GMPReceive>, _payload_hash: [u8; 32]) -> Result<()> {
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
    require!(
        mint_message.recipient == ctx.accounts.recipient.key().to_bytes(),
        AssetRouterError::RecipientMismatch
    );
    require!(mint_message.amount > 0, AssetRouterError::ZeroAmount);

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
