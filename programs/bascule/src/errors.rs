//! Custom errors that the program can return.

use anchor_lang::error_code;

#[error_code]
pub enum BasculeError {
    #[msg("This account is not allowed to perform admin operations")]
    ENotAdmin,

    #[msg("This account is not allowed to report deposits")]
    ENotReporter,

    #[msg("This account is not allowed pause the program")]
    ENotPauser,

    #[msg("This account is not allowed to validate withdrawals")]
    ENotValidator,

    #[msg("Contract is paused")]
    EPaused,

    #[msg("The deposit has already been withdrawn")]
    EAlreadyWithdrawn,

    #[msg("The withdrawal amount is not in the history above the non-zero validation threshold")]
    EWithdrawalFailedValidation,

    #[msg("The program has reached the max number of withdrawal validators")]
    EMaxValidators,

    #[msg("The deposit id does not match the deposit data")]
    EInvalidDepositId,
}
