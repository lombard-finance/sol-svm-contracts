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

#[account]
pub struct OutboundMessage(pub MessageV1);

impl OutboundMessage {
    pub fn size(body_length: usize) -> usize {
        MessageV1::size(body_length)
    }

    /// Returns the number of bytes that are accountable for sending the message.
    /// This is the amount of bytes when this is encoded in ABI for consortium validation.
    pub fn accountable_abi_bytes(&self) -> u64 {
        4 + // payload selector
        32 + // message path identifier
        32 + // nonce
        32 + // sender
        32 + // recipient
        32 + // destination caller
        32 + // body offset
        32 + // body length
        self.0.body.len() as u64 / 32 * 32 + // body length in 32 bytes slots
        // padding of abi that encodes in 32 bytes slots
        if self.0.body.len() % 32 != 0 { 32 } else { 0 }
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
