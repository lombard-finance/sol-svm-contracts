use anchor_lang::prelude::*;

pub mod constants;
pub mod errors;
pub mod events;
pub mod instructions;
pub mod security;
pub mod state;
pub mod utils;

use constants::OPTIONAL_MESSAGE_SIZE;
use instructions::*;
use state::{AccountRole, };
use utils::gmp_messages::{InboundResponse, OutboundResponse};

use base_token_pool::rate_limiter::RateLimitConfig;

declare_id!("CAwQ43gQmFB6CD4zodoKt7ipPrHP7eQLxvGRY6tQ6zYx");

#[program]
pub mod bridge {

    use super::*;

    pub fn initialize(
        ctx: Context<Initialize>,
        admin: Pubkey,
        mailbox: Pubkey,
    ) -> Result<()> {
        instructions::initialize(ctx, admin, mailbox)
    }

    pub fn grant_account_role(
        ctx: Context<GrantAccountRole>,
        account: Pubkey,
        account_role: AccountRole,
    ) -> Result<()> {
        instructions::grant_account_role(ctx, account, account_role)
    }

    pub fn revoke_account_roles(ctx: Context<RevokeAccountRoles>, account: Pubkey) -> Result<()> {
        instructions::revoke_account_roles(ctx, account)
    }

    pub fn deposit(
        ctx: Context<Deposit>,
        sender: [u8; 32],
        recipient: [u8; 32],
        caller: Option<[u8; 32]>,
        amount: u64,
        message: Option<[u8; OPTIONAL_MESSAGE_SIZE]>,        
    ) -> Result<OutboundResponse> {
        instructions::deposit(ctx, sender, recipient, caller, amount, message)
    }

    pub fn gmp_receive(ctx: Context<GMPReceive>, payload_hash: [u8; 32]) -> Result<InboundResponse> {
        instructions::gmp_receive(ctx, payload_hash)
    }

    pub fn transfer_ownership(ctx: Context<Admin>, new_admin: Pubkey) -> Result<()> {
        instructions::transfer_ownership(ctx, new_admin)
    }

    pub fn accept_ownership(ctx: Context<AcceptOwnership>) -> Result<()> {
        instructions::accept_ownership(ctx)
    }

    pub fn pause(ctx: Context<Pause>) -> Result<()> {
        instructions::pause(ctx)
    }

    pub fn unpause(ctx: Context<Admin>) -> Result<()> {
        instructions::unpause(ctx)
    }

    pub fn set_sender_config(
        ctx: Context<SetSenderConfig>,
        sender_program: Pubkey,
        fee_discount: u64,
        whitelisted: bool,
    ) -> Result<()> {
        instructions::set_sender_config(ctx, sender_program, fee_discount, whitelisted)
    }

    pub fn unset_sender_config(ctx: Context<UnsetSenderConfig>, sender_program: Pubkey) -> Result<()> {
        instructions::unset_sender_config(ctx, sender_program)
    }

    pub fn set_local_token_config(
    ctx: Context<SetLocalTokenConfig>,
    mint: Pubkey, 
    ) -> Result<()> {
        instructions::set_local_token_config(ctx, mint)
    }

    pub fn unset_local_token_config(ctx: Context<UnsetLocalTokenConfig>, mint: Pubkey) -> Result<()> {
        instructions::unset_local_token_config(ctx, mint)
    }

    pub fn set_remote_token_config(
    ctx: Context<SetRemoteTokenConfig>,
    mint: Pubkey,
    chain_id: [u8; 32],
    token: [u8; 32], 
    direction: u8,
    ) -> Result<()> {
        instructions::set_remote_token_config(ctx, mint, chain_id, token, direction)
    }
    
    pub fn unset_remote_token_config(ctx: Context<UnsetRemoteTokenConfig>, mint: Pubkey, chain_id: [u8; 32]) -> Result<()> {
        instructions::unset_remote_token_config(ctx, mint, chain_id)
    }

    pub fn set_remote_bridge_config(
    ctx: Context<SetRemoteBridgeConfig>,
    chain_id: [u8; 32],
    bridge: [u8; 32], 
    ) -> Result<()> {
        instructions::set_remote_bridge_config(ctx, chain_id, bridge)
    }
    
    pub fn unset_remote_bridge_config(ctx: Context<UnsetRemoteBridgeConfig>, chain_id: [u8; 32]) -> Result<()> {
        instructions::unset_remote_bridge_config(ctx, chain_id)
    }

    pub fn set_rate_limit(
    ctx: Context<SetRateLimit>,
    mint: Pubkey,
    chain_id: [u8; 32],
    inbound_rate_limit: RateLimitConfig,
    ) -> Result<()> {
        instructions::set_rate_limit(ctx, mint, chain_id, inbound_rate_limit)
    }
}