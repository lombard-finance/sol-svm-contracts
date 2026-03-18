use anchor_lang::prelude::*;

pub mod constants;
pub mod errors;
pub mod events;
pub mod instructions;
pub mod state;

use instructions::*;

declare_id!("EeqDRCWDpex3p33a8Zuw1jm1eyYRoW2jXSEuCEKdFAw2");

#[program]
pub mod mock_ccip_offramp {

    use super::*;

    pub fn initialize(ctx: Context<Initialize>, token_pool: Pubkey) -> Result<()> {
        instructions::initialize(ctx, token_pool)
    }

    pub fn add_offramp(
        ctx: Context<AddOfframp>,
        source_chain_selector: u64,
        offramp: Pubkey,
    ) -> Result<()> {
        instructions::add_offramp(ctx, source_chain_selector, offramp)
    }

    pub fn init_offramp(ctx: Context<InitOfframp>, nonce: u16, data: ReleaseOrMintInV1) -> Result<()> {
        instructions::init_offramp(ctx, nonce, data)
    }

    pub fn execute_offramp<'a, 'b, 'c, 'info>(ctx: Context<'a, 'b, 'c, 'info, ExecuteOfframpContext<'info>>, nonce: u16) -> Result<()> {
        instructions::execute_offramp(ctx, nonce)
    }

    pub fn execute_onramp<'a, 'b, 'c, 'info>(
        ctx: Context<'a, 'b, 'c, 'info, ExecuteOnrampContext<'info>>,
        receiver: Vec<u8>, //  The recipient of the tokens on the destination chain
        remote_chain_selector: u64, // The chain ID of the destination chain
        original_sender: Pubkey, // The original sender of the tx on the source chain
        amount: u64, // local solana amount to lock/burn,  The amount of tokens to lock or burn, denominated in the source token's decimals
        msg_total_nonce: u64,
    ) -> Result<()> {
        instructions::execute_onramp(ctx, receiver, remote_chain_selector, original_sender, amount, msg_total_nonce)
    }
}
