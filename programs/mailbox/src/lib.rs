use anchor_lang::prelude::*;

pub mod constants;
pub mod errors;
pub mod events;
pub mod instructions;
pub mod security;
pub mod state;
pub mod utils;

use instructions::*;

use crate::state::AccountRole;

declare_id!("3TfSFMuw31Je57m5Wcd9ZopGzjrHLHkjh292aEwXvm3h");

#[program]
pub mod mailbox {

    use super::*;

    pub fn initialize(
        ctx: Context<Initialize>,
        admin: Pubkey,
        consortium: Pubkey,
        treasury: Pubkey,
        default_max_payload_size: u32,
        fee_per_byte: u64,
    ) -> Result<()> {
        instructions::initialize(
            ctx,
            admin,
            consortium,
            treasury,
            default_max_payload_size,
            fee_per_byte,
        )
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

    pub fn enable_inbound_message_path(
        ctx: Context<EnableInboundMessagePath>,
        source_chain_id: [u8; 32],
        source_mailbox_address: [u8; 32],
    ) -> Result<()> {
        instructions::enable_inbound_message_path(ctx, source_chain_id, source_mailbox_address)
    }

    pub fn enable_outbound_message_path(
        ctx: Context<EnableOutboundMessagePath>,
        destination_chain_id: [u8; 32],
    ) -> Result<()> {
        instructions::enable_outbound_message_path(ctx, destination_chain_id)
    }

    pub fn disable_inbound_message_path(
        ctx: Context<DisableInboundMessagePath>,
        source_chain_id: [u8; 32],
    ) -> Result<()> {
        instructions::disable_inbound_message_path(ctx, source_chain_id)
    }

    pub fn disable_outbound_message_path(
        ctx: Context<DisableOutboundMessagePath>,
        destination_chain_id: [u8; 32],
    ) -> Result<()> {
        instructions::disable_outbound_message_path(ctx, destination_chain_id)
    }

    pub fn send_message(
        ctx: Context<SendMessage>,
        message_body: Vec<u8>,
        recipient: [u8; 32],
        destination_caller: Option<[u8; 32]>,
    ) -> Result<()> {
        instructions::send_message(ctx, message_body, recipient, destination_caller)
    }

    pub fn deliver_message(ctx: Context<DeliverMessage>, payload_hash: [u8; 32]) -> Result<()> {
        instructions::deliver_message(ctx, payload_hash)
    }

    pub fn handle_message<'a, 'b, 'c, 'info>(
        ctx: Context<'a, 'b, 'c, 'info, HandleMessage<'info>>,
        payload_hash: [u8; 32],
    ) -> Result<()> {
        instructions::handle_message(ctx, payload_hash)
    }

    pub fn transfer_ownership(ctx: Context<Admin>, new_admin: Pubkey) -> Result<()> {
        instructions::transfer_ownership(ctx, new_admin)
    }

    pub fn accept_ownership(ctx: Context<AcceptOwnership>) -> Result<()> {
        instructions::accept_ownership(ctx)
    }

    pub fn update_config(
        ctx: Context<Admin>,
        default_max_payload_size: Option<u32>,
        fee_per_byte: Option<u64>,
    ) -> Result<()> {
        instructions::update_config(ctx, default_max_payload_size, fee_per_byte)
    }

    pub fn pause(ctx: Context<Pause>) -> Result<()> {
        instructions::pause(ctx)
    }

    pub fn unpause(ctx: Context<Admin>) -> Result<()> {
        instructions::unpause(ctx)
    }

    pub fn set_sender_config(
        ctx: Context<SetSenderConfig>,
        sender_program: Pubkey,
        max_payload_size: u32,
        fee_disabled: bool,
    ) -> Result<()> {
        instructions::set_sender_config(ctx, sender_program, max_payload_size, fee_disabled)
    }

    pub fn unset_sender_config(ctx: Context<UnsetSenderConfig>, sender_program: Pubkey) -> Result<()> {
        instructions::unset_sender_config(ctx, sender_program)
    }
}
