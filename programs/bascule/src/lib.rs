use anchor_lang::prelude::*;

pub mod errors;
pub mod events;
pub mod instructions;
pub mod state;

declare_id!("At7x8PtHWsJrLFLFRf6VY3eBmtCwsTFEBeKU2CzKvtvs");

use crate::state::DepositId;
use instructions::*;

#[program]
pub mod bascule {
    use super::*;

    /// Initialize the program
    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        instructions::initialize(ctx)
    }

    /// Set the validate threshold
    pub fn update_validate_threshold(ctx: Context<Admin>, new_threshold: u64) -> Result<()> {
        instructions::update_validate_threshold(ctx, new_threshold)
    }

    /// Authorize a pauser (unauthorizing any previously authorized pauser)
    pub fn grant_pauser(ctx: Context<Admin>, pauser: Pubkey) -> Result<()> {
        instructions::grant_pauser(ctx, pauser)
    }

    /// Authorize a reporter (unauthorizing any previously authorized reporter)
    pub fn grant_reporter(ctx: Context<Admin>, reporter: Pubkey) -> Result<()> {
        instructions::grant_reporter(ctx, reporter)
    }

    /// Authorize a validator
    pub fn add_withdrawal_validator(ctx: Context<Admin>, validator: Pubkey) -> Result<()> {
        instructions::add_withdrawal_validator(ctx, validator)
    }

    /// Unauthorize a validator
    pub fn remove_withdrawal_validator(ctx: Context<Admin>, validator: Pubkey) -> Result<()> {
        instructions::remove_withdrawal_validator(ctx, validator)
    }

    /// Pause the program
    pub fn pause(ctx: Context<Pauser>) -> Result<()> {
        instructions::pause(ctx)
    }

    /// Unpause the program
    pub fn unpause(ctx: Context<Pauser>) -> Result<()> {
        instructions::unpause(ctx)
    }

    /// Report a deposit
    pub fn report_deposit(ctx: Context<Reporter>, deposit_id: DepositId) -> Result<()> {
        instructions::report_deposit(ctx, deposit_id)
    }

    /// Validate a withdrawal
    ///
    /// # Arguments
    /// * `ctx` - validator context
    /// * `deposit_id` - the id of the deposit to validate (this value must be derived from the rest of the arguments)
    /// * `recipient` - the Solana address of the recipient
    /// * `amount` - the bitcoin transaction amount in SAT
    /// * `tx_id` - the bitcoin transaction id
    /// * `tx_vout` - the bitcoin transaction output index
    // CODESYNC(validate-args)
    #[allow(unused_variables)] // used by the macro
    pub fn validate_withdrawal(
        ctx: Context<Validator>,
        deposit_id: DepositId,
        recipient: Pubkey,
        amount: u64,
        tx_id: [u8; 32],
        tx_vout: u32,
    ) -> Result<()> {
        instructions::validate_withdrawal(ctx, deposit_id, amount)
    }
}
