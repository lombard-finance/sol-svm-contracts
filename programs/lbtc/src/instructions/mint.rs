//! Minting instruction for privileged users.
use crate::{errors::LBTCError, state::Config, utils};
use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint as MintInterface, TokenAccount, TokenInterface};

#[derive(Accounts)]
pub struct Mint<'info> {
    pub payer: Signer<'info>,
    pub config: Account<'info, Config>,
    pub token_program: Interface<'info, TokenInterface>,
    #[account(
        mut,
        token::mint = mint,
        token::token_program = token_program,
    )]
    pub recipient: InterfaceAccount<'info, TokenAccount>,
    #[account(mut, address = config.mint)]
    pub mint: InterfaceAccount<'info, MintInterface>,
    /// CHECK: The seeds constraint ensures the correct address is passed.
    #[account(seeds = [crate::constants::TOKEN_AUTHORITY_SEED], bump)]
    pub token_authority: UncheckedAccount<'info>,
}

pub fn mint(ctx: Context<Mint>, amount: u64) -> Result<()> {
    require!(!ctx.accounts.config.paused, LBTCError::Paused);
    require!(
        ctx.accounts
            .config
            .minters
            .iter()
            .any(|&minter| minter == ctx.accounts.payer.key()),
        LBTCError::Unauthorized
    );

    utils::execute_mint(
        ctx.accounts.token_program.to_account_info(),
        ctx.accounts.recipient.to_account_info(),
        amount,
        ctx.accounts.mint.to_account_info(),
        ctx.accounts.token_authority.to_account_info(),
        ctx.bumps.token_authority,
    )
}
