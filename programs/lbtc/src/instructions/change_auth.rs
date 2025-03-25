//! Admin functionality to change authorities on the mint.
//! XXX USE WITH EXTREME CAUTION
use crate::{constants, events::MintAuthorityUpdated, state::Config};
use anchor_lang::prelude::*;
use anchor_spl::token_2022::spl_token_2022::instruction::AuthorityType;
use anchor_spl::token_interface::{set_authority, Mint, SetAuthority, TokenInterface};

#[derive(Accounts)]
pub struct ChangeAuth<'info> {
    #[account(address = config.admin)]
    pub payer: Signer<'info>,
    pub config: Account<'info, Config>,
    #[account(mut, address = config.mint)]
    pub mint: InterfaceAccount<'info, Mint>,
    /// CHECK: We only need the account info and don't need to constrain otherwise. If the wrong
    /// current authority is passed the function call will fail.
    pub current_auth: UncheckedAccount<'info>,
    pub token_program: Interface<'info, TokenInterface>,
    /// CHECK: The seeds constraint ensures the correct address is passed.
    #[account(seeds = [constants::TOKEN_AUTHORITY_SEED], bump)]
    pub token_authority: UncheckedAccount<'info>,
}

pub fn change_mint_auth(ctx: Context<ChangeAuth>, new_auth: Pubkey) -> Result<()> {
    // We use the LBTC config as the signer.
    let token_authority_sig: &[&[&[u8]]] = &[&[
        constants::TOKEN_AUTHORITY_SEED,
        &[ctx.bumps.token_authority],
    ]];
    set_authority(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            SetAuthority {
                current_authority: ctx.accounts.current_auth.to_account_info(),
                account_or_mint: ctx.accounts.mint.to_account_info(),
            },
            token_authority_sig,
        ),
        AuthorityType::MintTokens,
        Some(new_auth),
    )?;
    emit!(MintAuthorityUpdated { new_auth });
    Ok(())
}
