use anchor_lang::prelude::*;

use crate::{
    errors::BasculeError,
    program::Bascule,
    state::{BasculeData, BASCULE_SEED},
};

#[derive(Accounts)]
pub struct Initialize<'info> {
    /// The system account paying for this instruction.
    /// Must be the same as the program upgrade authority.
    /// Automatically becomes the 'admin' of the created [BasculeData] account.
    #[account(mut)]
    payer: Signer<'info>,

    /// This program account.
    ///
    /// ASSERT:
    /// - `program_data` account is provided if the program is upgradeable
    #[account(constraint = Ok(program_data.as_ref().map(|p| p.key())) == program.programdata_address())]
    program: Program<'info, Bascule>,

    /// The program data account; must be provided if the program is upgradeable
    /// (non-upgradable programs do not have a [ProgramData] account).
    ///
    /// ASSERT:
    /// - the payer is equal to the upgrade authority, if the program is upgradeable
    #[account(constraint = Some(payer.key()) == program_data.upgrade_authority_address @ BasculeError::ENotDeployer)]
    program_data: Option<Account<'info, ProgramData>>,

    /// The program state
    #[account(
        // create new account
        init,
        // payer for the account storage
        payer = payer,
        // program-derived address of the bascule data account
        // (this ensures that only one BasculeData account may exist per Bascule program)
        seeds = [BASCULE_SEED], bump,
        // space size (which must be pre-allocated)
        space = 8 + BasculeData::INIT_SPACE
    )]
    bascule_data: Account<'info, BasculeData>,

    /// The system program (needed for the 'init' constraint of the 'data' account)
    system_program: Program<'info, System>,
}

/// Creates the [BasculeData] account
///
/// Effects:
/// - creates a new [BasculeData] account
/// - sets [BasculeData::admin] to the account paying for this instruction
pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
    let bascule_data: &mut BasculeData = &mut ctx.accounts.bascule_data;
    // PublicKey defaults to `PublicKey(11111111111111111111111111111111)` for which no private key exists
    *bascule_data = BasculeData {
        admin: *ctx.accounts.payer.key,
        pauser: Pubkey::default(),
        pending_admin: Pubkey::default(),
        deposit_reporter: Pubkey::default(),
        is_paused: false,
        validate_threshold: 0,
        withdrawal_validators: vec![],
        bump: ctx.bumps.bascule_data,
    };

    Ok(())
}
