//! Collection of operator-privileged functionality.
use crate::{constants, errors::LBTCError, events::MintFeeSet, state::Config};
use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct Operator<'info> {
    #[account(address = config.operator)]
    pub payer: Signer<'info>,
    #[account(mut, seeds = [constants::CONFIG_SEED], bump)]
    pub config: Account<'info, Config>,
}

pub fn set_mint_fee(ctx: Context<Operator>, mint_fee: u64) -> Result<()> {
    require!(mint_fee <= constants::MAX_FEE, LBTCError::FeeTooHigh);
    ctx.accounts.config.mint_fee = mint_fee;
    emit!(MintFeeSet { mint_fee });
    Ok(())
}
