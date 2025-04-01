//! Deployer instructions (may be performed by the program's upgrade authority account only)

use anchor_lang::{prelude::*, solana_program::bpf_loader_upgradeable};

use crate::{
    errors::BasculeError, events::AdminGranted, state::{BasculeData, BASCULE_SEED}
};

#[derive(Accounts)]
pub struct Deployer<'info> {
    /// The account paying for this instruction
    ///
    /// ASSERT:
    /// - the account address is the same as the program upgrade authority
    #[account(mut, address = program_data.upgrade_authority_address.unwrap_or_default() @ BasculeError::ENotDeployer)]
    deployer: Signer<'info>,

    /// The corresponding [ProgramData] account (which exists only if the program is upgradeable,
    /// therefore, this instruction can only be called if the program is upgradeable).
    #[account(
        seeds = [crate::ID.as_ref()], bump,
        seeds::program = bpf_loader_upgradeable::id(),
    )]
    program_data: Account<'info, ProgramData>,

    /// The program state
    #[account(mut, seeds = [BASCULE_SEED], bump = bascule_data.bump)]
    bascule_data: Account<'info, BasculeData>,
}

/// Updates the admin account.
///
/// Requires:
/// - the signer is the program's upgrade authority (errors with [BasculeError::ENotDeployer])
///
/// Effects:
/// - sets [BasculeData::admin] to `admin`, overwriting the previous admin
pub fn grant_admin(ctx: Context<Deployer>, admin: Pubkey) -> Result<()> {
    ctx.accounts.bascule_data.admin = admin;
    emit!(AdminGranted {
        current_deployer: ctx.accounts.deployer.key(),
        new_admin: admin
    });
    Ok(())
}
