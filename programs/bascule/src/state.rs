//! Program state

use anchor_lang::prelude::*;

/// Type alias for the 32-byte deposit id
pub type DepositId = [u8; 32];

/// The state of a deposit
#[derive(Debug, Default, Clone, InitSpace, AnchorSerialize, AnchorDeserialize)]
pub enum DepositState {
    /// The default state (assigned upon initialization)
    #[default]
    Unreported,
    /// The state of a deposit upon [crate::instructions::report_deposit]
    Reported,
    /// The state of a deposit upon [crate::instructions::validate_withdrawal]
    Withdrawn,
}

/// The seed used for the [BasculeData] account
pub const BASCULE_SEED: &[u8] = b"bascule";

/// The seed used for the [Deposit] accounts
pub const DEPOSIT_SEED: &[u8] = b"deposit";

/// Max number of withdrawal validators
pub const MAX_VALIDATORS: usize = 10;

/// The bascule program state
#[account]
#[derive(InitSpace)]
pub struct BasculeData {
    /// The account that has the "admin" capability.
    ///
    /// This account can grant other capabilities and update most of the properties of this data account.
    /// Whoever calls the "Initialize" instruction becomes the admin; afterwards, the admin cannot be changed.
    //
    // NOTE: in EVM and SUI bascule this is called "owner"; here we call it "admin"
    //       to disambiguate from the Solana-defined account owner.
    pub admin: Pubkey,

    /// The pending admin (which needs to explicitly accept before becoming the new admin).
    pub pending_admin: Pubkey,

    /// The account that has the "pauser" capability.
    /// This account is allowed to pause and unpause the program.
    /// Defaults to the program admin, but can be changed later.
    pub pauser: Pubkey,

    /// The account that is allowed to report deposits.
    /// Must be explicitly set in a subsequent instruction.
    pub deposit_reporter: Pubkey,

    /// The accounts that are allowed to validate withdrawals.
    /// INVARIANT:
    /// - this vector contains no duplicates
    #[max_len(MAX_VALIDATORS)]
    pub withdrawal_validators: Vec<Pubkey>,

    /// Whether the program paused
    pub is_paused: bool,

    /// Bascule validates all withdrawals whose amounts are greater than or equal
    /// to this threshold. The bascule allows all withdrawals below this threshold.
    /// The program will still produce events that off-chain code can use to
    /// monitor smaller withdrawals.
    ///
    /// When the threshold is zero (the default), the bascule validates all withdrawals.
    pub validate_threshold: u64,

    /// Canonical bump for the program-derived address, set upon creation
    pub bump: u8,
}

/// The deposit account.
///
/// The number of deposits that the Bascule program must keep track of is not bounded
/// ahead of time, which is why deposits are modeled as Solana accounts and not as
/// part of the [BasculeData] state.
#[account]
#[derive(InitSpace)]
pub struct Deposit {
    /// The state of the deposit
    pub state: DepositState,

    /// Canonical bump for the program-derived address, set upon creation
    pub bump: u8,
}
