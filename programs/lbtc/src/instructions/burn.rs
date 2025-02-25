//! Burning instruction for privileged users.
use crate::{errors::LBTCError, state::Config, utils};
use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint as MintInterface, TokenAccount, TokenInterface};

#[derive(Accounts)]
pub struct Burn<'info> {
    pub payer: Signer<'info>,
    pub config: Account<'info, Config>,
    pub token_program: Interface<'info, TokenInterface>,
    #[account(
        mut,
        token::mint = mint,
        token::authority = payer,
        token::token_program = token_program,
    )]
    pub recipient: InterfaceAccount<'info, TokenAccount>,
    #[account(mut)]
    pub mint: InterfaceAccount<'info, MintInterface>,
}

pub fn burn(ctx: Context<Burn>, amount: u64) -> Result<()> {
    require!(!ctx.accounts.config.paused, LBTCError::Paused);
    require!(
        ctx.accounts
            .config
            .minters
            .iter()
            .any(|&minter| minter == ctx.accounts.payer.key()),
        LBTCError::Unauthorized
    );

    utils::execute_burn(
        ctx.accounts.token_program.to_account_info(),
        ctx.accounts.recipient.to_account_info(),
        amount,
        ctx.accounts.mint.to_account_info(),
        ctx.accounts.payer.to_account_info(),
    )
}
