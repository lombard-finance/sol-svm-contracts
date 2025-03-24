//! Admin functionality to change authorities on the mint.
//! XXX USE WITH EXTREME CAUTION
use crate::{
    constants,
    events::{FreezeAuthorityUpdated, MintAuthorityUpdated},
    state::Config,
};
use anchor_lang::prelude::*;
use anchor_spl::token_2022::spl_token_2022::instruction::AuthorityType;
use anchor_spl::token_interface::{set_authority, Mint, SetAuthority};

#[derive(Accounts)]
pub struct ChangeAuth<'info> {
    #[account(address = config.admin)]
    pub payer: Signer<'info>,
    #[account(seeds = [constants::CONFIG_SEED], bump)]
    pub config: Account<'info, Config>,
    #[account(mut, address = config.mint)]
    pub mint: InterfaceAccount<'info, Mint>,
    /// CHECK: We only need the account info and don't need to constrain otherwise. If the wrong
    /// current authority is passed the function call will fail.
    pub current_auth: UncheckedAccount<'info>,
}

pub fn change_mint_auth(ctx: Context<ChangeAuth>, new_auth: Pubkey) -> Result<()> {
    // We use the LBTC config as the signer.
    let signer_seeds: &[&[&[u8]]] = &[&[constants::CONFIG_SEED, &[ctx.bumps.config]]];
    set_authority(
        CpiContext::new_with_signer(
            ctx.accounts.mint.to_account_info(),
            SetAuthority {
                current_authority: ctx.accounts.current_auth.to_account_info(),
                account_or_mint: ctx.accounts.mint.to_account_info(),
            },
            signer_seeds,
        ),
        AuthorityType::MintTokens,
        Some(new_auth),
    )?;
    emit!(MintAuthorityUpdated { new_auth });
    Ok(())
}

pub fn change_freeze_auth(ctx: Context<ChangeAuth>, new_auth: Pubkey) -> Result<()> {
    // We use the LBTC config as the signer.
    let signer_seeds: &[&[&[u8]]] = &[&[constants::CONFIG_SEED, &[ctx.bumps.config]]];
    set_authority(
        CpiContext::new_with_signer(
            ctx.accounts.mint.to_account_info(),
            SetAuthority {
                current_authority: ctx.accounts.current_auth.to_account_info(),
                account_or_mint: ctx.accounts.mint.to_account_info(),
            },
            signer_seeds,
        ),
        AuthorityType::FreezeAccount,
        Some(new_auth),
    )?;
    emit!(FreezeAuthorityUpdated { new_auth });
    Ok(())
}
