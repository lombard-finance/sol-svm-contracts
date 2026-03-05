//! Native redeem functionality for LBTC.
use crate::{
    constants::{self, CHAIN_ID},
    errors::AssetRouterError,
    state::{Config, MessagingAuthority, TokenConfig, TokenRoute, TokenRouteType},
    utils::{self, gmp_messages::Redeem as RedeemMsg},
};
use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};
use mailbox::{
    cpi::{accounts::SendMessage, send_message},
    program::Mailbox,
};

#[derive(Accounts)]
#[instruction(to_lchain_id: [u8; 32], to_token_address: [u8; 32])]
pub struct Redeem<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(
        constraint = !config.paused @ AssetRouterError::Paused,
        seeds = [constants::CONFIG_SEED],
        bump,
    )]
    pub config: Account<'info, Config>,
    #[account(seeds = [constants::TOKEN_CONFIG_SEED, mint.key().as_ref()], bump)]
    pub token_config: Account<'info, TokenConfig>,
    #[account(
        constraint = token_route.route_type == TokenRouteType::Redeem @ AssetRouterError::InvalidTokenRouteType,
        seeds = [
            constants::TOKEN_ROUTE_SEED,
            &CHAIN_ID,
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
    #[account(mut)]
    pub mint: InterfaceAccount<'info, Mint>,
    #[account(
        mut,
        token::mint = mint,
        token::authority = config.treasury,
        token::token_program = token_program,
    )]
    pub treasury_token_account: InterfaceAccount<'info, TokenAccount>,

    #[account(seeds = [constants::MESSAGING_AUTHORITY_SEED], bump)]
    pub messaging_authority: Account<'info, MessagingAuthority>,

    // mailbox related accounts
    pub mailbox: Program<'info, Mailbox>,

    /// CHECK: This will be verified by the mailbox program
    #[account(mut)]
    pub mailbox_config: UncheckedAccount<'info>,
    /// CHECK: This will be verified by the mailbox program
    pub outbound_message_path: UncheckedAccount<'info>,
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

pub fn redeem(
    ctx: Context<Redeem>,
    to_lchain_id: [u8; 32],
    _to_token_address: [u8; 32],
    recipient: [u8; 32],
    amount: u64,
) -> Result<()> {

    require!(amount > 0, AssetRouterError::ZeroAmount);

    let fee = ctx.accounts.token_config.redeem_fee;
    require!(amount > fee, AssetRouterError::FeeGTEAmount);

    anchor_spl::token_interface::transfer_checked(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            anchor_spl::token_interface::TransferChecked {
                from: ctx.accounts.payer_token_account.to_account_info(),
                to: ctx.accounts.treasury_token_account.to_account_info(),
                authority: ctx.accounts.payer.to_account_info(),
                mint: ctx.accounts.mint.to_account_info(),
            },
        ),
        fee,
        constants::BTC_DECIMALS,
    )?;

    utils::execute_burn(
        ctx.accounts.token_program.to_account_info(),
        ctx.accounts.payer_token_account.to_account_info(),
        amount - fee,
        ctx.accounts.mint.to_account_info(),
        ctx.accounts.payer.to_account_info(),
    )?;

    let redeem_msg = RedeemMsg {
        destination_chain_id: to_lchain_id,
        from_token_address: ctx.accounts.mint.key().to_bytes(),
        sender: ctx.accounts.payer_token_account.key().to_bytes(),
        recipient: recipient.to_vec(),
        amount: amount - fee,
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
        redeem_msg.to_gmp_body(),
        ctx.accounts.token_config.ledger_redeem_handler,
        None,
    )?;

    Ok(())
}
