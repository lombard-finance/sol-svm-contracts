use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};
use solana_address::bytes_are_curve_point;

use crate::{
    constants::{self, CONFIG_SEED, LOCAL_TOKEN_CONFIG_SEED, OPTIONAL_MESSAGE_SIZE, OUTBOUND_DIRECTION, REMOTE_BRIDGE_CONFIG_SEED, REMOTE_TOKEN_CONFIG_SEED, SENDER_CONFIG_SEED}, 
    errors::BridgeError, 
    state::{Config, LocalTokenConfig,RemoteBridgeConfig, RemoteTokenConfig,SenderConfig}, 
    utils::{gmp_messages::{BridgeToken as BridgeTokenMsg, OutboundResponse}, token_actions}
};

use mailbox::{
    constants::FEE_ADJUSTMET_BASE, cpi::{accounts::SendMessage, send_message}, program::Mailbox, state::{OutboundMessagePath}
};

#[derive(Accounts)]
pub struct Deposit<'info> {
    #[account(mut)]
    pub fee_payer: Signer<'info>,
    #[account(mut)]
    pub sender: Signer<'info>,
    #[account(
        mut,
        token::mint = mint,
        token::authority = sender,
        token::token_program = token_program,
    )]
    pub sender_token_account: InterfaceAccount<'info, TokenAccount>,
    pub token_program: Interface<'info, TokenInterface>,
    #[account(
        seeds = [CONFIG_SEED],
        constraint = !config.paused @ BridgeError::Paused, 
        bump
    )]
    pub config: Account<'info, Config>,

    #[account(
        seeds = [
            SENDER_CONFIG_SEED, 
            if bytes_are_curve_point(sender.key.as_ref()) {
                sender.key.as_ref()
            } else {
                sender.owner.as_ref()
            }
        ],
        constraint = sender_config.whitelisted @ BridgeError::NotWhitelisted,
        bump
    )]
    pub sender_config: Account<'info, SenderConfig>,
    #[account(
        seeds = [REMOTE_BRIDGE_CONFIG_SEED, &outbound_message_path.destination_chain_id],
        bump
    )]
    pub remote_bridge_config: Account<'info, RemoteBridgeConfig>,
    #[account(
        seeds = [LOCAL_TOKEN_CONFIG_SEED, mint.key().as_ref()],
        bump
    )]
    pub local_token_config: Account<'info, LocalTokenConfig>,
    #[account(
        seeds = [REMOTE_TOKEN_CONFIG_SEED, mint.key().as_ref(), &outbound_message_path.destination_chain_id],
        constraint = remote_token_config.direction & OUTBOUND_DIRECTION != 0 @ BridgeError::OutboundDirectionDisabled,
        bump
    )]
    pub remote_token_config: Account<'info, RemoteTokenConfig>,

    #[account(mut, address = local_token_config.mint)]
    pub mint: InterfaceAccount<'info, Mint>,
    
    #[account(address = config.mailbox)]
    pub mailbox: Program<'info, Mailbox>,

    /// CHECK: This will be verified by the mailbox program
    #[account(mut)]
    pub mailbox_config: UncheckedAccount<'info>,

    pub outbound_message_path: Account<'info, OutboundMessagePath>,
    /// CHECK: This will be verified by the mailbox program
    #[account(mut)]
    pub outbound_message: UncheckedAccount<'info>,
    /// CHECK: This will be verified by the mailbox program
    #[account(mut)]
    pub mailbox_sender_config: UncheckedAccount<'info>,

    #[account(mut)]
    pub treasury: Option<UncheckedAccount<'info>>,

    pub system_program: Program<'info, System>,
}

pub fn deposit(
    ctx: Context<Deposit>,
    sender: [u8; 32],
    recipient: [u8; 32],
    caller: Option<[u8; 32]>,
    amount: u64,
    message: Option<[u8; OPTIONAL_MESSAGE_SIZE]>,
) -> Result<OutboundResponse> {

    require!(amount > 0, BridgeError::ZeroAmount);
    token_actions::execute_burn(
        ctx.accounts.token_program.to_account_info(),
        ctx.accounts.sender_token_account.to_account_info(), // Use payer or another TokenAccount here
        amount,
        ctx.accounts.mint.to_account_info(),
        ctx.accounts.sender.to_account_info(),
    )?;

    let dest_token_addr = ctx.accounts.remote_token_config.token;

    let message = BridgeTokenMsg {
        destination_token_address: dest_token_addr,
        sender: sender,
        recipient: recipient,
        amount: amount,
        optional_message: message,
    };
    let signer_seeds: &[&[&[u8]]] = &[&[constants::CONFIG_SEED, &[ctx.bumps.config]]];
    let msg_body = message.to_gmp_body();

    let result = send_message(
        CpiContext::new_with_signer(
            ctx.accounts.mailbox
            .as_ref()
            .to_account_info(),
            SendMessage{
                fee_payer: ctx.accounts.fee_payer.to_account_info(),
                sender_authority: ctx.accounts.config.to_account_info(),
                config: ctx.accounts.mailbox_config.to_account_info(),
                outbound_message_path: ctx.accounts.outbound_message_path.to_account_info(),
                outbound_message: ctx.accounts.outbound_message.to_account_info(),
                treasury: match &ctx.accounts.treasury {
                    Some(a) => Some(a.to_account_info()),
                    None => None,
                },
                sender_config: Some(ctx.accounts.mailbox_sender_config.to_account_info()),
                system_program: ctx.accounts.system_program.to_account_info(),
            },
            signer_seeds,
        ),
        msg_body, ctx.accounts.remote_bridge_config.bridge, caller, FEE_ADJUSTMET_BASE - ctx.accounts.sender_config.fee_discount,
    )?;

    let send_result = result.get();


    emit!(crate::events::DepositToBridge {
        sender: ctx.accounts.sender_token_account.key().to_bytes(),
        recipient: recipient,
        payload_hash: send_result.payload_hash,
    });

    Ok(OutboundResponse { nonce: send_result.nonce, payload_hash: send_result.payload_hash })
}