//! Minting and burning instructions for privileged users.
use crate::{errors::LBTCError, state::Config, utils};
use anchor_lang::prelude::*;
use anchor_spl::token_interface::{TokenAccount, TokenInterface};

#[derive(Accounts)]
pub struct Mint<'info> {
    pub payer: Signer<'info>,
    pub config: Account<'info, Config>,
    pub token_program: Interface<'info, TokenInterface>,
    #[account(
        mut,
        token::mint = mint,
        token::authority = token_authority,
        token::token_program = token_program,
    )]
    pub recipient: InterfaceAccount<'info, TokenAccount>,
    pub mint: InterfaceAccount<'info, TokenAccount>,
    /// CHECK: This just needs to be the account of the recipient. Minting will fail if this is
    /// improperly specified.
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
    )
}

pub fn burn(ctx: Context<Mint>, amount: u64) -> Result<()> {
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
        ctx.accounts.token_authority.to_account_info(),
    )
}
