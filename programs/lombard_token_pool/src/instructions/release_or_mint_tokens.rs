use std::str::FromStr;

use anchor_lang::prelude::*;

use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};

use base_token_pool::common::*;
use ccip_common::seed;

use mailbox::{
    cpi::{accounts::HandleMessage, handle_message},
};

use bridge::{
    self,
    program::Bridge,
    state::RemoteBridgeConfig,
    utils::{gmp_messages::{InboundResponse}},
};

use mailbox::{
    self,
    program::Mailbox,
};

use crate::{
    constants::*,
    context::*,
    errors::LombardTokenPoolError,
    instructions::derive_accounts,
    state::{ChainConfig, State}
};

#[derive(Accounts)]
#[instruction(release_or_mint: ReleaseOrMintInV1)]
pub struct TokenOfframp<'info> {
    // CCIP accounts ------------------------
    #[account(
        seeds = [EXTERNAL_TOKEN_POOLS_SIGNER, crate::ID.as_ref()],
        bump,
        seeds::program = offramp_program.key(),
    )]
    pub authority: Signer<'info>,

    /// CHECK offramp program: exists only to derive the allowed offramp PDA
    /// and the authority PDA.
    pub offramp_program: UncheckedAccount<'info>,

    /// CHECK PDA of the router program verifying the signer is an allowed offramp.
    /// If PDA does not exist, the router doesn't allow this offramp
    #[account(
        owner = state.config.router @ CcipTokenPoolError::InvalidPoolCaller, // this guarantees that it was initialized
        seeds = [
            ALLOWED_OFFRAMP,
            release_or_mint.remote_chain_selector.to_le_bytes().as_ref(),
            offramp_program.key().as_ref()
        ],
        bump,
        seeds::program = state.config.router,
    )]
    pub allowed_offramp: UncheckedAccount<'info>,

    // Token pool accounts ------------------
    // consistent set + token pool program
    #[account(
        seeds = [
            POOL_STATE_SEED,
            mint.key().as_ref()
        ],
        bump,
        constraint = valid_version(state.version, MAX_POOL_STATE_V) @ CcipTokenPoolError::InvalidVersion,
    )]
    pub state: Box<Account<'info, State>>,

    #[account(address = state.config.token_program)]
    pub token_program: Interface<'info, TokenInterface>,

    #[account(mut)]
    pub mint: InterfaceAccount<'info, Mint>,

    /// CHECK: CPI signer
    #[account(
        mut, // Lombard's receive_message method requires that this account is mutable,
             // although it does not really mutate it
        seeds = [POOL_SIGNER_SEED, mint.key().as_ref()],
        bump,
        address = state.config.pool_signer,
    )]
    pub pool_signer: UncheckedAccount<'info>,

    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = pool_signer,
        associated_token::token_program = token_program,
    )]
    pub pool_token_account: InterfaceAccount<'info, TokenAccount>,

    #[account(
        mut,
        seeds = [
            POOL_CHAINCONFIG_SEED,
            &release_or_mint.remote_chain_selector.to_le_bytes(),
            mint.key().as_ref(),
        ],
        bump,
        constraint = valid_version(chain_config.version, MAX_POOL_CHAIN_CONFIG_V) @ CcipTokenPoolError::InvalidVersion,
    )]
    pub chain_config: Box<Account<'info, ChainConfig>>,

    ////////////////////
    // RMN Remote CPI //
    ////////////////////
    /// CHECK: This is the account for the RMN Remote program
    #[account(
        address = state.config.rmn_remote @ CcipTokenPoolError::InvalidRMNRemoteAddress,
    )]
    pub rmn_remote: UncheckedAccount<'info>,

    /// CHECK: This account is just used in the CPI to the RMN Remote program
    #[account(
        seeds = [seed::CURSES],
        bump,
        seeds::program = state.config.rmn_remote,
    )]
    pub rmn_remote_curses: UncheckedAccount<'info>,

    /// CHECK: This account is just used in the CPI to the RMN Remote program
    #[account(
        seeds = [seed::CONFIG],
        bump,
        seeds::program = state.config.rmn_remote,
    )]
    pub rmn_remote_config: UncheckedAccount<'info>,
    /// CHECK: This will be verified by the mailbox program
    #[account(mut)]
    pub receiver_token_account: UncheckedAccount<'info>,

    // Lombard GMP-specific accounts
    /// CHECK: This will be verified by the mailbox program
    #[account()]
    pub mint_authority: UncheckedAccount<'info>,
    /// CHECK: This will be verified by the mailbox program
    #[account()]
    pub token_authority: UncheckedAccount<'info>,
    #[account(address = state.config.bridge @ LombardTokenPoolError::InvalidBridge)]
    pub bridge: Program<'info, Bridge>,
    /// CHECK: This will be verified by the mailbox program
    #[account()]
    pub bridge_config: UncheckedAccount<'info>,
    /// CHECK: This will be verified by the bridge program
    #[account()]
    pub mailbox: Option<Program<'info, Mailbox>>,
    /// CHECK: This will be verified by the mailbox program
    #[account()]
    pub mailbox_config: UncheckedAccount<'info>,
    /// CHECK: This will be verified by the mailbox program
    #[account()]
    pub treasury: Option<UncheckedAccount<'info>>,
    /// CHECK: This will be verified by the mailbox program
    #[account(
        constraint = remote_bridge_config.chain_id == chain_config.bridge.destination_chain_id @ LombardTokenPoolError::RemoteChainMismatch
    )]
    pub remote_bridge_config: Account<'info, RemoteBridgeConfig>,
    /// CHECK: This will be verified by the mailbox program
    #[account()]
    pub local_token_config: UncheckedAccount<'info>,
    /// CHECK: This will be verified by the mailbox program
    #[account()]
    pub remote_token_config: UncheckedAccount<'info>,
    /// CHECK: This will be verified by the mailbox program
    #[account()]
    pub inbound_message_path: UncheckedAccount<'info>,
    /// CHECK: This will be verified by the mailbox program
    #[account(mut)]
    pub message_info: UncheckedAccount<'info>,
    /// CHECK: This will be verified by the mailbox program
    #[account(mut)]
    pub message_handled: UncheckedAccount<'info>,
    /// The system program (needed for the 'init' constraint of the 'data' account)
    pub system_program: Program<'info, System>,
}

pub fn release_or_mint_tokens<'info>(
    ctx: Context<TokenOfframp>,
    release_or_mint: ReleaseOrMintInV1,
) -> Result<ReleaseOrMintOutV1> {

    let parsed_amount = to_svm_token_amount(
        release_or_mint.amount,
        8,
        8,
    )?;

    let BaseChain {
        remote,
        inbound_rate_limit,
        ..
    } = &mut ctx.accounts.chain_config.base;

    validate_release_or_mint(
        &release_or_mint,
        parsed_amount,
        ctx.accounts.state.config.mint,
        &remote.pool_addresses,
        inbound_rate_limit,
        ctx.accounts.rmn_remote.to_account_info(),
        ctx.accounts.rmn_remote_curses.to_account_info(),
        ctx.accounts.rmn_remote_config.to_account_info(),
    )?;

    let response = mailbox_receive_message(&ctx, &release_or_mint.source_pool_data.try_into().unwrap())?;
    match response {
        Some(res) => require!(res.amount == parsed_amount, LombardTokenPoolError::AmountMismatch),
        None => {}
    };

    emit!(Minted {
        sender: ctx.accounts.authority.key(),
        recipient: release_or_mint.receiver,
        amount: parsed_amount,
        mint: ctx.accounts.state.config.mint,
    });

    Ok(ReleaseOrMintOutV1 {
        destination_amount: parsed_amount,
    })
}

fn mailbox_receive_message<'info>(
    ctx: &Context<TokenOfframp>,
    payload_hash: &[u8; 32],
) -> Result<Option<InboundResponse>> {
    let signer_seeds: &[&[&[u8]]] = &[&[
        POOL_SIGNER_SEED,
        &ctx.accounts.mint.key().to_bytes(),
        &[ctx.bumps.pool_signer],
    ]];
    let ra:Vec<AccountInfo<'_>> = [
        ctx.accounts.pool_signer.to_account_info(),
        ctx.accounts.bridge_config.to_account_info(),
        ctx.accounts.message_handled.to_account_info(),
        ctx.accounts.token_program.to_account_info(),
        ctx.accounts.receiver_token_account.to_account_info(),
        ctx.accounts.mint.to_account_info(),
        ctx.accounts.mint_authority.to_account_info(),
        ctx.accounts.token_authority.to_account_info(),
        ctx.accounts.remote_bridge_config.to_account_info(),
        ctx.accounts.local_token_config.to_account_info(),
        ctx.accounts.remote_token_config.to_account_info(),
        ctx.accounts.inbound_message_path.to_account_info(),
        ctx.accounts.system_program.to_account_info()
    ].to_vec();
    let cpi_context = CpiContext::new_with_signer(
        ctx.accounts.mailbox
        .as_ref()
        .expect("mailbox must be provided")
        .to_account_info(),
        HandleMessage {
            handler: ctx.accounts.pool_signer.to_account_info(),
            config: ctx.accounts.mailbox_config.to_account_info(),
            message_info: ctx.accounts.message_info.to_account_info(),
            recipient_program: ctx.accounts.bridge.to_account_info(),
        },
        signer_seeds,
    ).with_remaining_accounts(
        ra
    );

    let result = handle_message(
    cpi_context,
        *payload_hash,
    )?;
    let result_data = result.get();
    let response = match result_data {
        Some(result_vec) => InboundResponse::try_from_slice(&result_vec)?,
        None => return Ok(None)
    };

    Ok(Some(response))
}

pub fn derive_accounts_release_or_mint_tokens<'info>(
    ctx: Context<'_, '_, 'info, 'info, Empty>,
    stage: String,
    release_or_mint: ReleaseOrMintInV1,
) -> Result<DeriveAccountsResponse> {
    msg!("Stage: {}", stage);
    let stage = derive_accounts::release_or_mint::OfframpDeriveStage::from_str(&stage)?;

    match stage {
        derive_accounts::release_or_mint::OfframpDeriveStage::RetrieveChainConfig => {
            derive_accounts::release_or_mint::retrieve_chain_config(&release_or_mint)
        }
        derive_accounts::release_or_mint::OfframpDeriveStage::BuildDynamicAccounts => {
            derive_accounts::release_or_mint::build_dynamic_accounts(ctx, &release_or_mint)
        }
    }
}