//! Implements the Lombard Finance protocol on Solana.
pub(crate) mod constants;
pub(crate) mod errors;
mod events;
pub mod instructions;
pub mod security;
pub(crate) mod state;
pub(crate) mod utils;

use anchor_lang::prelude::*;
use instructions::*;
use state::{AccountRole, Config, TokenConfig, TokenRouteType};
use utils::consortium_payloads::DEPOSIT_V1_PAYLOAD_LEN;
use utils::fee::FEE_PAYLOAD_LEN;

#[cfg(feature = "mainnet")]
declare_id!("Lom9TMiPbqkXk8ddFooUY1gbHqt87TCmVfTfv8AHgYx");
#[cfg(feature = "gastald")]
declare_id!("Lom7TQyK45pTUjFmmsuLaBrMVQ5crggYnSuCrjm9ebr");
#[cfg(feature = "staging")]
declare_id!("Lomby2CBo9czSz6jeQo73mK4fNfpF5vNz1RTW22sE8o");
#[cfg(feature = "bft")]
declare_id!("LomVyJDZ91jeVbNnTupJXKJTQFakJVMc87CmwDHYt95");
#[cfg(any(feature = "localnet", not(any(feature = "mainnet", feature = "gastald", feature = "staging", feature = "bft"))))]
declare_id!("5enTNrkEghWJHXCbXzbbTWUTvx9YFP7nQ4n1SHgbZmLh");

#[program]
pub mod asset_router {

    use super::*;

    pub fn initialize(ctx: Context<Initialize>, config: Config) -> Result<()> {
        instructions::initialize(ctx, config)
    }

    pub fn mint_from_payload(
        ctx: Context<MintFromPayload>,
        mint_payload: [u8; DEPOSIT_V1_PAYLOAD_LEN],
        mint_payload_hash: [u8; 32],
    ) -> Result<()> {
        instructions::mint_from_payload(ctx, mint_payload, mint_payload_hash)
    }

    pub fn mint_with_fee(
        ctx: Context<MintWithFee>,
        mint_payload_hash: [u8; 32],
        fee_payload: [u8; FEE_PAYLOAD_LEN],
        fee_signature: [u8; 64],
    ) -> Result<()> {
        instructions::mint_with_fee(ctx, mint_payload_hash, fee_payload, fee_signature)
    }

    pub fn deposit(
        ctx: Context<Deposit>,
        to_lchain_id: [u8; 32],
        to_token_address: [u8; 32],
        recipient: [u8; 32],
        amount: u64,
    ) -> Result<()> {
        instructions::deposit(ctx, to_lchain_id, to_token_address, recipient, amount)
    }

    pub fn redeem(
        ctx: Context<Redeem>,
        to_lchain_id: [u8; 32],
        to_token_address: [u8; 32],
        recipient: [u8; 32],
        amount: u64,
    ) -> Result<()> {
        instructions::redeem(ctx, to_lchain_id, to_token_address, recipient, amount)
    }

    pub fn redeem_for_btc(
        ctx: Context<RedeemForBtc>,
        script_pubkey: Vec<u8>,
        amount: u64,
    ) -> Result<()> {
        instructions::redeem_for_btc(ctx, script_pubkey, amount)
    }

    pub fn gmp_receive(ctx: Context<GMPReceive>, payload_hash: [u8; 32]) -> Result<()> {
        instructions::gmp_receive(ctx, payload_hash)
    }

    pub fn accept_ownership(ctx: Context<AcceptOwnership>) -> Result<()> {
        instructions::accept_ownership(ctx)
    }

    pub fn transfer_ownership(ctx: Context<Admin>, new_admin: Pubkey) -> Result<()> {
        instructions::transfer_ownership(ctx, new_admin)
    }

    pub fn set_bascule(ctx: Context<Admin>, bascule: Option<Pubkey>) -> Result<()> {
        instructions::set_bascule(ctx, bascule)
    }

    pub fn set_bascule_gmp(ctx: Context<Admin>, bascule_gmp: Option<Pubkey>) -> Result<()> {
        instructions::set_bascule_gmp(ctx, bascule_gmp)
    }

    pub fn set_mint_fee(ctx: Context<SetMintFee>, mint_fee: u64) -> Result<()> {
        instructions::set_mint_fee(ctx, mint_fee)
    }

    pub fn set_treasury(ctx: Context<SetTreasury>, treasury: Pubkey) -> Result<()> {
        instructions::set_treasury(ctx, treasury)
    }

    pub fn change_mint_auth(ctx: Context<ChangeAuth>, new_auth: Pubkey) -> Result<()> {
        instructions::change_mint_auth(ctx, new_auth)
    }

    pub fn pause(ctx: Context<Pause>) -> Result<()> {
        instructions::pause(ctx)
    }

    pub fn unpause(ctx: Context<Admin>) -> Result<()> {
        instructions::unpause(ctx)
    }

    pub fn set_token_config(
        ctx: Context<SetTokenConfig>,
        mint_address: Pubkey,
        token_config: TokenConfig,
    ) -> Result<()> {
        instructions::set_token_config(ctx, mint_address, token_config)
    }

    pub fn set_token_route(
        ctx: Context<SetTokenRoute>,
        from_chain_id: [u8; 32],
        from_token_address: [u8; 32],
        to_chain_id: [u8; 32],
        to_token_address: [u8; 32],
        token_route_type: TokenRouteType,
    ) -> Result<()> {
        instructions::set_token_route(
            ctx,
            from_chain_id,
            from_token_address,
            to_chain_id,
            to_token_address,
            token_route_type,
        )
    }

    pub fn unset_token_route(
        ctx: Context<UnsetTokenRoute>,
        from_chain_id: [u8; 32],
        from_token_address: [u8; 32],
        to_chain_id: [u8; 32],
        to_token_address: [u8; 32],
    ) -> Result<()> {
        instructions::unset_token_route(
            ctx,
            from_chain_id,
            from_token_address,
            to_chain_id,
            to_token_address,
        )
    }

    pub fn change_native_mint(ctx: Context<ChangeNativeToken>, native_mint: Pubkey) -> Result<()> {
        instructions::change_native_mint(ctx, native_mint)
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
}
