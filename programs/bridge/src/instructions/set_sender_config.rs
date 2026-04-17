use anchor_lang::prelude::*;
use mailbox::constants::FEE_ADJUSTMET_BASE;

use crate::constants::{CONFIG_SEED, SENDER_CONFIG_SEED};
use crate::{
    errors::BridgeError,
    events::SenderConfigSet,
    state::{Config, SenderConfig},
};

#[derive(Accounts)]
#[instruction(sender_program: Pubkey)]
pub struct SetSenderConfig<'info> {
    #[account(mut, address = config.admin @ BridgeError::Unauthorized)]
    pub admin: Signer<'info>,
    #[account(mut, seeds = [CONFIG_SEED], bump)]
    pub config: Account<'info, Config>,
    #[account(
        init_if_needed,
        payer = admin,
        space = 8 + SenderConfig::INIT_SPACE,
        seeds = [SENDER_CONFIG_SEED, &sender_program.to_bytes()],
        bump
    )]
    pub sender_config: Account<'info, SenderConfig>,
    pub system_program: Program<'info, System>,
}

pub fn set_sender_config(
    ctx: Context<SetSenderConfig>,
    sender_program: Pubkey,
    fee_discount: u64,
    whitelisted: bool,
) -> Result<()> {
    require!(fee_discount <= FEE_ADJUSTMET_BASE, BridgeError::UnexpectedFeeDiscount);
    ctx.accounts.sender_config.bump = ctx.bumps.sender_config;
    ctx.accounts.sender_config.fee_discount = fee_discount;
    ctx.accounts.sender_config.whitelisted = whitelisted;
    emit!(SenderConfigSet {
        sender_program,
        fee_discount,
        whitelisted
    });
    Ok(())
}
