use anchor_lang::prelude::*;

use crate::state::{BasculeData, BASCULE_SEED};

#[derive(Accounts)]
pub struct Initialize<'info> {
    /// The system account paying for this instruction
    /// (automatically becomes the 'admin' of the created [BasculeData] account)
    #[account(mut)]
    payer: Signer<'info>,

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
/// Requires:
/// - nothing
///
/// Effects:
/// - creates a new [BasculeData] account
/// - sets [BasculeData::admin] to the account paying for this instruction
pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
    let bascule_data: &mut BasculeData = &mut ctx.accounts.bascule_data;
    *bascule_data = BasculeData {
        admin: *ctx.accounts.payer.key,
        pauser: Pubkey::default(),
        deposit_reporter: Pubkey::default(),
        is_paused: false,
        validate_threshold: 0,
        withdrawal_validators: vec![],
        bump: ctx.bumps.bascule_data,
    };

    Ok(())
}
