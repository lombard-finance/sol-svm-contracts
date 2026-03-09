//! Defines all events for the Lombard Mailbox protocol.
use anchor_lang::prelude::*;
use base_token_pool::rate_limiter::RateLimitConfig;

use crate::state::AccountRole;

#[event]
pub struct DestinationBridgeSet {
    pub destination_chain_id: [u8; 32],
    pub destination_bridge:  [u8; 32],
}

#[event]
pub struct DepositToBridge {
    pub sender: [u8; 32],
    pub recipient: [u8; 32],
    pub payload_hash: [u8; 32],
}

#[event]
pub struct PauserAdded {
    pub pauser: Pubkey,
}

#[event]
pub struct PauserRemoved {
    pub pauser: Pubkey,
}

#[event]
pub struct ProgramPaused {
    pub paused: bool,
}

#[event]
pub struct OwnershipTransferInitiated {
    pub new_admin: Pubkey,
}

#[event]
pub struct OwnershipTransferred {
    pub new_admin: Pubkey,
}

#[event]
pub struct AccountRoleGranted {
    pub account: Pubkey,
    pub account_role: AccountRole,
}

#[event]
pub struct AccountRolesRevoked {
    pub account: Pubkey,
}

#[event]
pub struct SenderConfigSet {
    pub sender_program: Pubkey,
    pub fee_discount: u64,
    pub whitelisted: bool,
}

#[event]
pub struct SenderConfigUnset {
    pub sender_program: Pubkey,
}

#[event]
pub struct LocalTokenConfigSet {
    pub mint: Pubkey,
}

#[event]
pub struct LocalTokenConfigUnset {
    pub mint: Pubkey,
}

#[event]
pub struct RemoteTokenConfigSet {
    pub mint: Pubkey,
    pub chain_id: [u8; 32],
    pub token: [u8; 32], 
    pub direction: u8,
}

#[event]
pub struct RemoteTokenConfigUnset {
    pub mint: Pubkey,
    pub chain_id: [u8; 32],
}

#[event]
pub struct RemoteBridgeConfigSet {
    pub chain_id: [u8; 32],
    pub bridge: [u8; 32], 
}

#[event]
pub struct RemoteBridgeConfigUnset {
    pub chain_id: [u8; 32],
}

#[event]
pub struct BridgeRateLimitConfigured {
    pub mint: Pubkey,
    pub chain_id: [u8; 32],
    pub inbound_rate_limit: RateLimitConfig,
}
