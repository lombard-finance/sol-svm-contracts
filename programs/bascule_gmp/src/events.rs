use anchor_lang::prelude::*;

use crate::state::{AccountRole, MintPayloadState};

#[event]
pub struct ProgramPaused {
    pub paused: bool,
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
pub struct MintReported {
    pub mint_id: [u8; 32],
    pub amount: u64,
}

#[event]
pub struct MintValidated {
    pub mint_id: [u8; 32],
    pub previous_state: MintPayloadState,
    pub amount: u64,
}

#[event]
pub struct ValidateThresholdUpdated {
    pub new_threshold: u64,
}

#[event]
pub struct OwnershipTransferInitiated {
    pub new_admin: Pubkey,
}
