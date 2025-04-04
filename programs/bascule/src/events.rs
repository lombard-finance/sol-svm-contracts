//! Custom events that the program can emit.

use anchor_lang::event;
use anchor_lang::prelude::*;

use crate::state::{DepositId, DepositState};

/// Event emitted when the validation threshold is updated.
#[event]
pub struct UpdateValidateThreshold {
    pub old_threshold: u64,
    pub new_threshold: u64,
}

/// Event emitted when deposit was successfully reported.
#[event]
pub struct DepositReported {
    pub deposit_id: DepositId,
}

/// Event emitted when reporting an already reported/withdrawn deposit.
#[event]
pub struct AlreadyReported {
    pub deposit_id: DepositId,
    pub status: DepositState,
}

/// Event emitted when a withdrawal is allowed on this chain without validation.
#[event]
pub struct WithdrawalNotValidated {
    pub deposit_id: DepositId,
    pub amount: u64,
}

/// Event emitted when a withdrawal is validated.
#[event]
pub struct WithdrawalValidated {
    pub deposit_id: DepositId,
    pub amount: u64,
}

/// Event emitted when admin transfer is initiate
#[event]
pub struct AdminTransferInitiated {
    /// The current admin
    pub current_admin: Pubkey,
    /// The new admin (who still has to accept the transfer)
    pub pending_admin: Pubkey,
}

/// Event emitted when admin transfer is accepted
#[event]
pub struct AdminTransferAccepted {
    /// The new admin who has just accept the transfer
    pub new_admin: Pubkey,
}
