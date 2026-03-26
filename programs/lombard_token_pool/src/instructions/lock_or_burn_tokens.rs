use anchor_lang::prelude::*;

use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};

use base_token_pool::common::*;
use ccip_common::{CommonCcipError, seed};

use bridge::{
    self, 
    cpi::{accounts::Deposit, deposit}, 
    program::Bridge, 
    state::RemoteBridgeConfig, 
    utils::token_actions::get_token_account
};

use crate::{
    constants::*,
    errors::LombardTokenPoolError,
    state::{ChainConfig, State}
};

#[derive(Accounts)]
#[instruction(lock_or_burn: LockOrBurnInV1)]
pub struct TokenOnramp<'info> {
    // CCIP accounts ------------------------
    #[account(
        mut,
        address = state.config.router_onramp_authority @ CcipTokenPoolError::InvalidPoolCaller
    )]
    pub authority: Signer<'info>,

    pub token_program: Interface<'info, TokenInterface>,

    #[account(mut)]
    pub mint: InterfaceAccount<'info, Mint>,

    // Token pool accounts ------------------
    // consistent set + token pool program
    #[account(
        seeds = [POOL_STATE_SEED, mint.key().as_ref()],
        bump,
        constraint = valid_version(state.version, MAX_POOL_STATE_V) @ CcipTokenPoolError::InvalidVersion,
    )]
    pub state: Box<Account<'info, State>>,

    /// CHECK: CPI signer. This account is intentionally not initialized, and it will
    /// hold a balance to pay for the rent of initializing the Lombard MessageSentEvent account
    #[account(
        mut,
        seeds = [POOL_SIGNER_SEED, mint.key().as_ref()],
        bump,
        address = state.config.pool_signer,
    )]
    pub pool_signer: UncheckedAccount<'info>,
    #[account(
        mut,
        address = get_token_account(
            token_program.key(),
            mint.key(),
            pool_signer.key(),
        )? @ CommonCcipError::InvalidInputsTokenAccounts
    )]
    pub pool_token_account: InterfaceAccount<'info, TokenAccount>,
    ////////////////////
    // RMN Remote CPI //
    ////////////////////
    /// CHECK: RMNRemote program, invoked to check for curses
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

    #[account(
        mut,
        seeds = [
            POOL_CHAINCONFIG_SEED,
            lock_or_burn.remote_chain_selector.to_le_bytes().as_ref(),
            mint.key().as_ref()
        ],
        bump,
        constraint = valid_version(chain_config.version, MAX_POOL_CHAIN_CONFIG_V) @ CcipTokenPoolError::InvalidVersion,
    )]
    pub chain_config: Account<'info, ChainConfig>,

    // Lombard GMP-specific accounts
    #[account(address = state.config.bridge @ LombardTokenPoolError::InvalidBridge)]
    pub bridge: Option<Program<'info, Bridge>>,
    /// CHECK: This will be verified by the bridge program
    #[account()]
    pub mailbox: UncheckedAccount<'info>,
    /// CHECK: This will be verified by the mailbox program
    #[account(mut)]
    pub mailbox_config: UncheckedAccount<'info>,
    /// CHECK: This will be verified by the bridge program
    #[account()]
    pub bridge_config: UncheckedAccount<'info>,
    /// CHECK: This will be verified by the mailbox program
    #[account()]
    pub bridge_sender_config: UncheckedAccount<'info>,
    /// CHECK: This will be verified by the mailbox program
    pub outbound_message_path: UncheckedAccount<'info>,
    /// CHECK: This will be verified by the mailbox program
    #[account(mut)]
    pub outbound_message: UncheckedAccount<'info>,
    /// CHECK: This will be verified by the mailbox program
    #[account(mut)]
    pub mailbox_sender_config: UncheckedAccount<'info>,
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
    pub treasury: Option<UncheckedAccount<'info>>,

    pub system_program: Program<'info, System>,
}

pub fn lock_or_burn_tokens(
    ctx: Context<TokenOnramp>,
    lock_or_burn: LockOrBurnInV1,
) -> Result<LockOrBurnOutV1> {
    validate_lock_or_burn(
        &lock_or_burn,
        ctx.accounts.state.config.mint,
        &mut ctx.accounts.chain_config.base.outbound_rate_limit,
        ctx.accounts.state.config.list_enabled,
        &ctx.accounts.state.config.allow_list,
        ctx.accounts.rmn_remote.to_account_info(),
        ctx.accounts.rmn_remote_curses.to_account_info(),
        ctx.accounts.rmn_remote_config.to_account_info(),
    )?;

    let bridge_payload_hash = bridge_deposit_for_burn_with_caller(&ctx, &lock_or_burn)?;

    // This event is standardized with the BurnmintTokenPool program
    emit!(Burned {
        sender: ctx.accounts.authority.key(),
        amount: lock_or_burn.amount,
        mint: ctx.accounts.state.config.mint,
    });

    // let extra_data = TokenPoolExtraData {
    //     nonce: bridge_nonce,
    //     source_domain: SOLANA_DOMAIN_ID,
    // };

    Ok(LockOrBurnOutV1 {
        dest_token_address: ctx.accounts.chain_config.base.remote.token_address.clone(),
        // The dest_pool_data is then read by the remote pool, so we standardize on ABI-encoding
        dest_pool_data: abi_encode(&bridge_payload_hash),
    })
}

fn bridge_deposit_for_burn_with_caller(
    ctx: &Context<TokenOnramp>,
    lock_or_burn: &LockOrBurnInV1,
) -> Result<[u8; 32]> {
    // Token transfer to the token pool is supposed to be done by `ccip_send` 

    let pool_signer_seeds: &[&[&[u8]]] = &[&[
        POOL_SIGNER_SEED,
        &ctx.accounts.mint.key().to_bytes(),
        &[ctx.bumps.pool_signer],
    ]];

    let cpi_context = CpiContext::new_with_signer(
        ctx.accounts.bridge
        .as_ref()
        .expect("bridge must be provided")
        .to_account_info(),
        Deposit {
            fee_payer: ctx.accounts.authority.to_account_info(), 
            sender: ctx.accounts.pool_signer.to_account_info(), 
            sender_token_account: ctx.accounts.pool_token_account.to_account_info(), 
            token_program: ctx.accounts.token_program.to_account_info(), 
            config: ctx.accounts.bridge_config.to_account_info(), 
            mint: ctx.accounts.mint.to_account_info(), 
            mailbox: ctx.accounts.mailbox.to_account_info(), 
            mailbox_config: ctx.accounts.mailbox_config.to_account_info(), 
            outbound_message_path: ctx.accounts.outbound_message_path.to_account_info(), 
            outbound_message: ctx.accounts.outbound_message.to_account_info(), 
            mailbox_sender_config: ctx.accounts.mailbox_sender_config.to_account_info(),
            sender_config: ctx.accounts.bridge_sender_config.to_account_info(),
            remote_bridge_config: ctx.accounts.remote_bridge_config.to_account_info(),
            local_token_config: ctx.accounts.local_token_config.to_account_info(),
            remote_token_config: ctx.accounts.remote_token_config.to_account_info(),
            treasury: match &ctx.accounts.treasury {
                Some(a) => Some(a.to_account_info()),
                None => None,
            },
            system_program: ctx.accounts.system_program.to_account_info(),
        },
        pool_signer_seeds,
    );

    let result = deposit(
    cpi_context,
        lock_or_burn.original_sender.to_bytes(), 
        lock_or_burn.receiver[0..32].try_into().unwrap(),
        Some(ctx.accounts.chain_config.bridge.destination_caller),
        lock_or_burn.amount,
        None,
    )?;

    let return_value = result.get();
    Ok(return_value.payload_hash)
}

pub fn abi_encode(payload: &[u8; 32]) -> Vec<u8> {
    payload.to_vec()
}
