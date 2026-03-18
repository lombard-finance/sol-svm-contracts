use anchor_lang::prelude::*;

use crate::utils::message_utils::MessageV1;

// todo: optimize by saving bumps for accounts used more often

#[account]
#[derive(InitSpace)]
pub struct Config {
    // Authorities
    pub admin: Pubkey,
    pub pending_admin: Pubkey,
    // to collect fees
    pub treasury: Pubkey,

    // Global pause
    pub paused: bool,

    // Consortium
    pub consortium: Pubkey,

    // A global nonce for all outgoing messages
    pub global_nonce: u64,
    // The default max payload size for messages
    pub default_max_payload_size: u32,
    // Lamports to charge per byte of payload when sending a message
    pub fee_per_byte: u64,
}

#[account]
#[derive(InitSpace)]
pub struct OutboundMessagePath {
    pub identifier: [u8; 32],
    pub destination_chain_id: [u8; 32],
}

#[account]
#[derive(InitSpace)]
pub struct InboundMessagePath {
    pub identifier: [u8; 32],
    pub source_mailbox_address: [u8; 32],
    pub source_chain_id: [u8; 32],
}

/// The state of a payload including a GMP message
#[derive(Debug, Default, Clone, InitSpace, AnchorSerialize, AnchorDeserialize, PartialEq)]
pub enum MessageState {
    /// The default state (assigned upon initialization)
    #[default]
    Unknown,
    /// The state of a payload when delivered from another chain
    Delivered,
    /// The state of a payload after it has been handled
    Handled,
}

#[account]
pub struct MessageV1Info {
    pub status: MessageState,
    pub message: MessageV1,
}

impl MessageV1Info {
    pub fn size(message_v1_size: usize) -> usize {
        return 1 + message_v1_size; // 1 for the status enum
    }
}

// todo: implement sender specific config

#[account]
#[derive(InitSpace)]
pub struct SenderConfig {
    pub bump: u8,
    pub max_payload_size: u32,
    pub fee_disabled: bool,
}

#[derive(Clone, Copy, AnchorSerialize, AnchorDeserialize, PartialEq, InitSpace)]
pub enum AccountRole {
    Pauser,
    None // a dummy case as it looks like anchor cannot serialize/deserialize if there is only one case
}

#[account]
#[derive(InitSpace)]
pub struct AccountRoles {
    #[max_len(3)] // to have some room for future roles
    pub roles: Vec<AccountRole>,
}

impl AccountRoles {
    pub fn add_role(&mut self, role: AccountRole) {
        self.roles.push(role);
    }

    pub fn has_role(&self, role: AccountRole) -> bool {
        self.roles.iter().any(|r| *r == role)
    }
}
