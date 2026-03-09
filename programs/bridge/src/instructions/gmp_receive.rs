use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint as TokenMint, TokenAccount, TokenInterface};

use mailbox::{constants::{INBOUND_MESSAGE_PATH_SEED, MESSAGE_SEED}, state::{InboundMessagePath, MessageV1Info}};

use crate::{
    constants::{CONFIG_SEED, INBOUND_DIRECTION, LOCAL_TOKEN_CONFIG_SEED, MESSAGE_HANDLED_SEED, REMOTE_BRIDGE_CONFIG_SEED, REMOTE_TOKEN_CONFIG_SEED},
    errors::BridgeError,
    state::{Config, LocalTokenConfig, MessageHandled, RemoteBridgeConfig, RemoteTokenConfig},
    utils::{gmp_messages::{InboundResponse, Mint}, token_actions},
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

    #[account(
        seeds = [CONFIG_SEED],
        constraint = !config.paused @ BridgeError::Paused, 
        bump,
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
    #[account(mut, address = local_token_config.mint)]
    pub mint: InterfaceAccount<'info, TokenMint>,
    /// CHECK: This being used in the mint call constrains it to be correct, otherwise the
    /// instruction will fail.
    pub mint_authority: UncheckedAccount<'info>,
    /// CHECK: The seeds constraint ensures the correct address is passed.
    #[account(seeds = [crate::constants::TOKEN_AUTHORITY_SEED], bump)]
    pub token_authority: UncheckedAccount<'info>,
    #[account(
        seeds = [REMOTE_BRIDGE_CONFIG_SEED, &inbound_message_path.source_chain_id],
        constraint = remote_bridge_config.bridge == message_info.message.sender,
        bump
    )]
    pub remote_bridge_config: Account<'info, RemoteBridgeConfig>,
    #[account(
        seeds = [LOCAL_TOKEN_CONFIG_SEED, mint.key().as_ref()],
        bump
    )]
    pub local_token_config: Account<'info, LocalTokenConfig>,
    #[account(
        mut,
        seeds = [REMOTE_TOKEN_CONFIG_SEED, mint.key().as_ref(), &inbound_message_path.source_chain_id],
        constraint = remote_token_config.direction & INBOUND_DIRECTION != 0 @ BridgeError::InboundDirectionDisabled,
        bump
    )]
    pub remote_token_config: Account<'info, RemoteTokenConfig>,
    #[account(
        seeds = [INBOUND_MESSAGE_PATH_SEED, &inbound_message_path.source_chain_id],
        seeds::program = config.mailbox,
        constraint = inbound_message_path.identifier == message_info.message.message_path_identifier,
        bump
    )]
    pub inbound_message_path: Account<'info, InboundMessagePath>,
    pub system_program: Program<'info, System>,
}

pub fn gmp_receive(ctx: Context<GMPReceive>, _payload_hash: [u8; 32]) -> Result<InboundResponse> {
    let mint_message = Mint::from_message(&ctx.accounts.message_info.message.body)?;

    // the following checks could be omitted and cause and error later on directly when
    // executing the mint instruction, but here we have a better error message
    require!(
        mint_message.token_address == ctx.accounts.mint.key().to_bytes(),
        BridgeError::InvalidTokenAddress
    );
    let recipient_derived_token_account = token_actions::get_token_account(ctx.accounts.token_program.key(), ctx.accounts.mint.key(), Pubkey::new_from_array(mint_message.recipient));
    require!(
        mint_message.recipient == ctx.accounts.recipient.key().to_bytes() || ctx.accounts.recipient.key() == recipient_derived_token_account?,
        BridgeError::RecipientMismatch
    );
    require!(mint_message.amount > 0, BridgeError::ZeroAmount);
    ctx.accounts.remote_token_config.inbound_rate_limit.consume::<Clock>(mint_message.amount)?;

    token_actions::execute_mint(
        ctx.accounts.token_program.to_account_info(),
        ctx.accounts.recipient.to_account_info(),
        mint_message.amount,
        ctx.accounts.mint.to_account_info(),
        ctx.accounts.mint_authority.to_account_info(),
        ctx.accounts.token_authority.to_account_info(),
        ctx.bumps.token_authority,
    )?;

    Ok(InboundResponse{
        amount: mint_message.amount,
        message: mint_message.message,
    })
}
