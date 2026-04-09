use anchor_lang::prelude::*;

use base_token_pool::common::*;
use base_token_pool::rate_limiter::*;

pub mod constants;
pub mod context;
pub mod errors;
pub mod events;
pub mod instructions;
pub mod security;
pub mod state;

use instructions::*;

use crate::{
    context::*,
    state::LombardChain
};


#[cfg(feature = "mainnet")]
declare_id!("Lomb8TTCwJKEhZrJ1J8UbsCRjNSf7NNQUEr4qo3dkSk");
#[cfg(feature = "gastald")]
declare_id!("Lomi5fKsXdGrrW2M3JRbJx5DnT3zgmSEfYWMUPeNaAB");
#[cfg(feature = "staging")]
declare_id!("LomtioA14cDhme8bCCw5oc5a9FUDyT91z8ujtGnY5g9");
#[cfg(feature = "bft")]
declare_id!("LomdWAg9hHyz3VrvK5wXTap7o348Ku2QJ2j2H8Etj3C");
#[cfg(any(feature = "localnet", not(any(feature = "mainnet", feature = "gastald", feature = "staging", feature = "bft"))))]
declare_id!("51HDypJbcZ1bmqh4v16X2KaHcvc53fYi84rbb21VoN4t");

pub const RECEIVE_MESSAGE_DISCRIMINATOR: [u8; 8] = [38, 144, 127, 225, 31, 225, 238, 25]; // global:receive_message
pub const DEPOSIT_FOR_BURN_WITH_CALLER_DISCRIMINATOR: [u8; 8] =
    [167, 222, 19, 114, 85, 21, 14, 118]; // global:deposit_for_burn_with_caller
pub const RECLAIM_EVENT_ACCOUNT_DISCRIMINATOR: [u8; 8] = [94, 198, 180, 159, 131, 236, 15, 174]; // global:reclaim_event_account

#[program]
pub mod lombard_token_pool {

    use super::*;

    pub fn init_global_config(ctx: Context<InitGlobalConfig>) -> Result<()> {
        instructions::init_global_config(ctx)
    }

    pub fn initialize(
        ctx: Context<InitializeTokenPool>,
        router: Pubkey,
        rmn_remote: Pubkey,
        bridge: Pubkey,
    ) -> Result<()> {
        instructions::initialize(ctx, router, rmn_remote, bridge)
    }

    /// Returns the program type (name) and version.
    /// Used by offchain code to easily determine which program & version is being interacted with.
    ///
    /// # Arguments
    /// * `ctx` - The context
    // pub fn type_version(_ctx: Context<Empty>) -> Result<String> {
    //     let response = env!("CCIP_BUILD_TYPE_VERSION").to_string();
    //     msg!("{}", response);
    //     Ok(response)
    // }

    pub fn transfer_ownership(ctx: Context<SetConfig>, proposed_owner: Pubkey) -> Result<()> {
        ctx.accounts.state.config.transfer_ownership(proposed_owner)
    }

    // shared func signature with other programs
    pub fn accept_ownership(ctx: Context<AcceptOwnership>) -> Result<()> {
        instructions::accept_ownership(ctx)
    }

    // set_router changes the expected signers for mint/release + burn/lock method calls
    // this is used to update the router address
    pub fn set_router(ctx: Context<AdminUpdateTokenPool>, new_router: Pubkey) -> Result<()> {
        instructions::set_router(ctx, new_router)
    }

    pub fn set_rmn(ctx: Context<AdminUpdateTokenPool>, rmn_address: Pubkey) -> Result<()> {
        instructions::set_rmn(ctx, rmn_address)
    }

    // initialize remote config (with no remote pools as it must be zero sized)
    pub fn init_chain_remote_config(
        ctx: Context<InitializeChainConfig>,
        remote_chain_selector: u64,
        mint: Pubkey,
        cfg: RemoteConfig,
        dest_chain_id: [u8; 32],
        dest_caller: [u8; 32],
    ) -> Result<()> {
        instructions::init_chain_remote_config(ctx, remote_chain_selector, mint, cfg, dest_chain_id, dest_caller)
    }

    // edit remote config's CCIP values
    pub fn edit_chain_remote_config(
        ctx: Context<EditChainConfigDynamicSize>,
        remote_chain_selector: u64,
        mint: Pubkey,
        cfg: RemoteConfig,
    ) -> Result<()> {
        instructions::edit_chain_remote_config(ctx, remote_chain_selector, mint, cfg)
    }

    // edit remote config's values that are specific to Lombard
    pub fn edit_chain_remote_config_lombard(
        ctx: Context<EditChainConfig>,
        remote_chain_selector: u64,
        mint: Pubkey,
        cfg: LombardChain,
    ) -> Result<()> {
        instructions::edit_chain_remote_config_lombard(ctx, remote_chain_selector, mint, cfg)
    }

    // Add remote pool addresses
    pub fn append_remote_pool_addresses(
        ctx: Context<AppendRemotePoolAddresses>,
        remote_chain_selector: u64,
        mint: Pubkey,
        addresses: Vec<RemoteAddress>,
    ) -> Result<()> {
        instructions::append_remote_pool_addresses(ctx, remote_chain_selector, mint, addresses)
    }

    // set rate limit
    pub fn set_chain_rate_limit(
        ctx: Context<SetChainRateLimit>,
        remote_chain_selector: u64,
        mint: Pubkey,
        inbound: RateLimitConfig,
        outbound: RateLimitConfig,
    ) -> Result<()> {
        instructions::set_chain_rate_limit(ctx, remote_chain_selector, mint, inbound, outbound)
    }

    // set rate limit admin
    pub fn set_rate_limit_admin(
        ctx: Context<SetRateLimitAdmin>,
        mint: Pubkey,
        new_rate_limit_admin: Pubkey,
    ) -> Result<()> {
        instructions::set_rate_limit_admin(ctx, mint, new_rate_limit_admin)
    }

    // delete chain config
    pub fn delete_chain_config(
        ctx: Context<DeleteChainConfig>,
        remote_chain_selector: u64,
        mint: Pubkey,
    ) -> Result<()> {
        instructions::delete_chain_config(ctx, remote_chain_selector, mint)
    }

    pub fn configure_allow_list(
        ctx: Context<AddToAllowList>,
        add: Vec<Pubkey>,
        enabled: bool,
    ) -> Result<()> {
        instructions::configure_allow_list(ctx, add, enabled)
    }

    pub fn remove_from_allow_list(
        ctx: Context<RemoveFromAllowlist>,
        remove: Vec<Pubkey>,
    ) -> Result<()> {
        instructions::remove_from_allow_list(ctx, remove)
    }

    pub fn release_or_mint_tokens<'info>(
        ctx: Context<TokenOfframp>,
        release_or_mint: ReleaseOrMintInV1,
    ) -> Result<ReleaseOrMintOutV1> {
        instructions::release_or_mint_tokens(ctx, release_or_mint)
    }

    pub fn derive_accounts_release_or_mint_tokens<'info>(
        ctx: Context<'_, '_, 'info, 'info, Empty>,
        stage: String,
        release_or_mint: ReleaseOrMintInV1,
    ) -> Result<DeriveAccountsResponse> {
        instructions::derive_accounts_release_or_mint_tokens(ctx, stage, release_or_mint)
    }

    pub fn lock_or_burn_tokens(
        ctx: Context<TokenOnramp>,
        lock_or_burn: LockOrBurnInV1,
    ) -> Result<LockOrBurnOutV1> {
        instructions::lock_or_burn_tokens(ctx, lock_or_burn)
    }
}
