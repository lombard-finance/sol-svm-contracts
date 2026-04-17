//! Defines all events for the Lombard Mailbox protocol.
use anchor_lang::prelude::*;

use crate::state::AccountRole;

#[event]
pub struct OutboundMessagePathStatusChanged {
    pub identifier: [u8; 32],
    pub destination_chain_id: [u8; 32],
    pub enabled: bool,
}

#[event]
pub struct InboundMessagePathStatusChanged {
    pub identifier: [u8; 32],
    pub source_mailbox_address: [u8; 32],
    pub source_chain_id: [u8; 32],
    pub enabled: bool,
}

#[event]
pub struct MessageSent {
    pub nonce: u64,
}

#[event]
pub struct MessageDelivered {
    pub payload_hash: [u8; 32],
    pub source_mailbox_address: [u8; 32],
    pub source_chain_id: [u8; 32],
}

#[event]
pub struct MessageHandled {
    pub payload_hash: [u8; 32],
}

#[event]
pub struct ConfigUpdated {
    pub admin: Pubkey,
    pub default_max_payload_size: u32,
    pub fee_per_byte: u64,
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
pub struct SenderConfigSet {
    pub sender_program: Pubkey,
    pub max_payload_size: u32,
    pub fee_disabled: bool,
}

#[event]
pub struct SenderConfigUnset {
    pub sender_program: Pubkey,
}

#[event]
pub struct TreasuryChanged {
    pub old_treasury: Pubkey,
    pub new_treasury: Pubkey,
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
