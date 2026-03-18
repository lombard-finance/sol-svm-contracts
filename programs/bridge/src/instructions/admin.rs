use anchor_lang::prelude::*;
use crate::{
    constants::CONFIG_SEED,
    errors::BridgeError,
    events::{OwnershipTransferInitiated, ProgramPaused},
    state::Config,
};

#[derive(Accounts)]
pub struct Admin<'info> {
    #[account(address = config.admin @ BridgeError::Unauthorized)]
    pub admin: Signer<'info>,
    #[account(
        mut,
        seeds = [CONFIG_SEED],
        bump,
    )]
    pub config: Account<'info, Config>,
}

pub fn transfer_ownership(ctx: Context<Admin>, new_admin: Pubkey) -> Result<()> {
    let config = &mut ctx.accounts.config;
    config.pending_admin = new_admin;
    
    emit!(OwnershipTransferInitiated {
        new_admin,
    });
    
    Ok(())
}

// pub fn update_config(
//     ctx: Context<Admin>,
//     default_max_payload_size: Option<u32>,
//     fee_per_byte: Option<u64>,
// ) -> Result<()> {
//     let config = &mut ctx.accounts.config;
    
//     if let Some(size) = default_max_payload_size {
//         config.default_max_payload_size = size;
//     }
    
//     if let Some(fee) = fee_per_byte {
//         config.fee_per_byte = fee;
//     }
    
//     emit!(crate::events::ConfigUpdated {
//         admin: config.admin,
//         default_max_payload_size: config.default_max_payload_size,
//         fee_per_byte: config.fee_per_byte,
//     });
    
//     Ok(())
// }

pub fn unpause(ctx: Context<Admin>) -> Result<()> {
    ctx.accounts.config.paused = false;
    emit!(ProgramPaused { paused: false });
    Ok(())
}
