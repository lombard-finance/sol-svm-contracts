//! Native redeem functionality for LBTC.
use crate::{
    constants,
    errors::AssetRouterError,
    state::{Config, MessagingAuthority, TokenConfig, TokenRoute, TokenRouteType},
    utils::{
        self, bitcoin_utils,
        gmp_messages::{Redeem as RedeemMsg, RedeemForBtc as RedeemForBtcMsg},
    },
};
use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};
use mailbox::{
    cpi::{accounts::SendMessage, send_message},
    program::Mailbox,
};

#[derive(Accounts)]
pub struct RedeemForBtc<'info> {
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
            &constants::CHAIN_ID,
            &mint.key().as_ref(),
            &config.bitcoin_lchain_id,
            &constants::BITCOIN_TOKEN_ADDRESS,
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

pub fn redeem_for_btc(
    ctx: Context<RedeemForBtc>,
    script_pubkey: Vec<u8>,
    amount: u64,
) -> Result<()> {
    require!(amount > 0, AssetRouterError::ZeroAmount);

    let is_native = ctx.accounts.mint.key() == ctx.accounts.config.native_mint;

    let fee = match is_native {
        true => ctx.accounts.token_config.to_native_commission,
        false => {
            ctx.accounts.token_config.redeem_fee + ctx.accounts.token_config.to_native_commission
        }
    };
    require!(amount > fee, AssetRouterError::FeeGTEAmount);

    let amount_after_fee = amount - fee;
    require!(
        amount_after_fee >= ctx.accounts.token_config.redeem_for_btc_min_amount,
        AssetRouterError::AmountBelowDustLimit
    );

    // check script pubkey is supported
    let _ = bitcoin_utils::get_output_type(&script_pubkey)?;

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
        amount_after_fee,
        ctx.accounts.mint.to_account_info(),
        ctx.accounts.payer.to_account_info(),
    )?;

    let gmp_body: Vec<u8> = match is_native {
        true => RedeemForBtcMsg {
            sender: ctx.accounts.payer_token_account.key().to_bytes(),
            script_pubkey: script_pubkey,
            amount: amount_after_fee,
        }
        .to_gmp_body(),
        false => RedeemMsg {
            destination_chain_id: ctx.accounts.config.bitcoin_lchain_id,
            from_token_address: ctx.accounts.mint.key().to_bytes(),
            sender: ctx.accounts.payer_token_account.key().to_bytes(),
            recipient: script_pubkey,
            amount: amount_after_fee,
        }
        .to_gmp_body(),
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
        gmp_body,
        ctx.accounts.token_config.ledger_redeem_handler,
        None,
        0
    )?;

    Ok(())
}
