//! Defines all events for the Lombard Finance protocol.
use anchor_lang::prelude::*;

#[event]
pub struct OwnershipTransferInitiated {
    pub new_admin: Pubkey,
}

#[event]
pub struct OwnershipTransferred {
    pub new_admin: Pubkey,
}

#[event]
pub struct ConsortiumUpdated {
    pub consortium: Pubkey,
}
