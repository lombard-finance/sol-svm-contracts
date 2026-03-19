//! Native redeem functionality for LBTC.
use crate::{
    constants::{self, BTC_STAKING_MODULE_ADDRESS},
    errors::AssetRouterError,
    state::{Config, MessagingAuthority, TokenRoute, TokenRouteType},
    utils::{self, gmp_messages::Deposit as DepositMsg},
};
use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};
use mailbox::{
    cpi::{accounts::SendMessage, send_message},
    program::Mailbox, state::OutboundMessagePath,
};

#[derive(Accounts)]
#[instruction(to_lchain_id: [u8; 32], to_token_address: [u8; 32])]
pub struct Deposit<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(
        constraint = !config.paused @ AssetRouterError::Paused,
        seeds = [constants::CONFIG_SEED],
        bump,
    )]
    pub config: Account<'info, Config>,
    #[account(
        constraint = token_route.route_type == TokenRouteType::Deposit @ AssetRouterError::InvalidTokenRouteType,
        seeds = [
            constants::TOKEN_ROUTE_SEED,
            &constants::CHAIN_ID,
            &mint.key().as_ref(),
            &to_lchain_id,
            &to_token_address
        ],
        bump,
    )]
    pub token_route: Account<'info, TokenRoute>,

    // mint related accounts
    #[account(
        mut,
        token::mint = mint,
        token::authority = payer,
        token::token_program = token_program,
    )]
    pub payer_token_account: InterfaceAccount<'info, TokenAccount>,
    pub token_program: Interface<'info, TokenInterface>,
    #[account(mut, address = config.native_mint)]
    pub mint: InterfaceAccount<'info, Mint>,

    #[account(seeds = [constants::MESSAGING_AUTHORITY_SEED], bump)]
    pub messaging_authority: Account<'info, MessagingAuthority>,

    // mailbox related accounts
    pub mailbox: Program<'info, Mailbox>,

    /// CHECK: This will be verified by the mailbox program
    #[account(mut)]
    pub mailbox_config: UncheckedAccount<'info>,
    #[account(
        constraint = outbound_message_path.destination_chain_id == config.ledger_lchain_id @ AssetRouterError::InvalidMessagePath,
    )]
    pub outbound_message_path: Account<'info, OutboundMessagePath>,
    /// CHECK: This will be verified by the mailbox program
    #[account(mut)]
    pub outbound_message: UncheckedAccount<'info>,
    /// CHECK: This will be verified by the mailbox program
    pub sender_config: Option<UncheckedAccount<'info>>,
    /// CHECK: This will be verified by the mailbox program
    #[account(mut)]
    pub treasury: Option<UncheckedAccount<'info>>,

    pub system_program: Program<'info, System>,
}

pub fn deposit(
    ctx: Context<Deposit>,
    to_lchain_id: [u8; 32],
    to_token_address: [u8; 32],
    recipient: [u8; 32],
    amount: u64,
) -> Result<()> {

    require!(amount > 0, AssetRouterError::ZeroAmount);

    utils::execute_burn(
        ctx.accounts.token_program.to_account_info(),
        ctx.accounts.payer_token_account.to_account_info(),
        amount,
        ctx.accounts.mint.to_account_info(),
        ctx.accounts.payer.to_account_info(),
    )?;

    let deposit_msg = DepositMsg {
        destination_chain_id: to_lchain_id,
        staking_token_address: to_token_address,
        sender: ctx.accounts.payer_token_account.key().to_bytes(),
        recipient: recipient,
        amount: amount,
    };

    let signer_seeds: &[&[&[u8]]] = &[&[
        constants::MESSAGING_AUTHORITY_SEED,
        &[ctx.bumps.messaging_authority],
    ]];
    let cpi_context = CpiContext::new_with_signer(
        ctx.accounts.mailbox.to_account_info(),
        SendMessage {
            fee_payer: ctx.accounts.payer.to_account_info(),
            sender_authority: ctx.accounts.messaging_authority.to_account_info(),
            config: ctx.accounts.mailbox_config.to_account_info(),
            outbound_message_path: ctx.accounts.outbound_message_path.to_account_info(),
            outbound_message: ctx.accounts.outbound_message.to_account_info(),
            sender_config: ctx
                .accounts
                .sender_config
                .clone()
                .map(|c| c.to_account_info()),
            treasury: ctx.accounts.treasury.clone().map(|t| t.to_account_info()),
            system_program: ctx.accounts.system_program.to_account_info(),
        },
        signer_seeds,
    );

    send_message(
        cpi_context,
        deposit_msg.to_gmp_body(),
        BTC_STAKING_MODULE_ADDRESS,
        None,
        0
    )?;

    Ok(())
}
