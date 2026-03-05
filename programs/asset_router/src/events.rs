//! Defines all events for the Lombard Finance protocol.
use crate::state::{AccountRole, TokenConfig, TokenRouteType};
use anchor_lang::prelude::*;

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
pub struct BasculeEnabled {
    pub enabled: bool,
}

#[event]
pub struct MintFeeSet {
    pub mint_fee: u64,
}

#[event]
pub struct TreasuryChanged {
    pub address: Pubkey,
}

#[event]
pub struct ProgramPaused {
    pub paused: bool,
}

#[event]
pub struct MintProofConsumed {
    pub recipient: Pubkey,
    pub payload_hash: [u8; 32],
}

#[event]
pub struct TokenConfigSet {
    pub config: TokenConfig,
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
pub struct MintAuthorityUpdated {
    pub new_auth: Pubkey,
}

#[event]
pub struct TokenRouteSet {
    pub from_chain_id: [u8; 32],
    pub from_token_address: [u8; 32],
    pub to_chain_id: [u8; 32],
    pub to_token_address: [u8; 32],
    pub token_route_type: TokenRouteType,
}

#[event]
pub struct TokenRouteUnset {
    pub from_chain_id: [u8; 32],
    pub from_token_address: [u8; 32],
    pub to_chain_id: [u8; 32],
    pub to_token_address: [u8; 32],
    pub token_route_type: TokenRouteType,
}
