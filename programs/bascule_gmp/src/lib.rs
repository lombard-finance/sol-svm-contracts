use anchor_lang::prelude::*;

pub mod constants;
pub mod errors;
pub mod events;
pub mod instructions;
pub mod security;
pub mod state;

use instructions::*;
use state::{AccountRole, MintMessage, MintProof};

#[cfg(feature = "mainnet")]
declare_id!("LomeavGUocL4Rn5TboDYFQEwUp3wBKodUTRKE8KqbE6");
#[cfg(feature = "gastald")]
declare_id!("LomuUjLMHJWsar8xxrbLhNSGdHTVg7hsoWnTibNtdgD");
#[cfg(feature = "staging")]
declare_id!("ToDo111111111111111111111111111111111111111");
#[cfg(feature = "bft")]
declare_id!("ToDo111111111111111111111111111111111111111");
#[cfg(not(any(feature = "mainnet", feature = "gastald", feature = "staging", feature = "bft")))]
declare_id!("BDCLiRc9M9srhamK61vi739dfcUbU7GAzJ5jQcDcaf3F");

#[program]
pub mod bascule_gmp {

    use super::*;

    pub fn initialize(
        ctx: Context<Initialize>,
        admin: Pubkey,
        validate_threshold: u64,
        trusted_signer: [u8; 64],
    ) -> Result<()> {
        instructions::initialize(ctx, admin, validate_threshold, trusted_signer)
    }

    pub fn grant_account_role(
        ctx: Context<GrantAccountRole>,
        account: Pubkey,
        account_role: AccountRole,
    ) -> Result<()> {
        instructions::grant_account_role(ctx, account, account_role)
    }

    pub fn revoke_account_roles(ctx: Context<RevokeAccountRoles>, account: Pubkey) -> Result<()> {
        instructions::revoke_account_roles(ctx, account)
    }

    pub fn pause(ctx: Context<Pause>) -> Result<()> {
        instructions::pause(ctx)
    }

    pub fn unpause(ctx: Context<Admin>) -> Result<()> {
        instructions::unpause(ctx)
    }

    pub fn transfer_ownership(ctx: Context<Admin>, new_admin: Pubkey) -> Result<()> {
        instructions::transfer_ownership(ctx, new_admin)
    }

    pub fn accept_ownership(ctx: Context<AcceptOwnership>) -> Result<()> {
        instructions::accept_ownership(ctx)
    }

    pub fn set_trusted_signer(ctx: Context<Admin>, trusted_signer: [u8; 64]) -> Result<()> {
        instructions::set_trusted_signer(ctx, trusted_signer)
    }

    pub fn report_mint(
        ctx: Context<ReportMint>,
        mint_message: MintMessage,
        proof: MintProof,
    ) -> Result<()> {
        instructions::report_mint(ctx, mint_message, proof)
    }

    pub fn validate_mint(ctx: Context<ValidateMint>, mint_message: MintMessage) -> Result<()> {
        instructions::validate_mint(ctx, mint_message)
    }

    pub fn update_validate_threshold(
        ctx: Context<UpdateValidateThreshold>,
        new_threshold: u64,
    ) -> Result<()> {
        instructions::update_validate_threshold(ctx, new_threshold)
    }
}
