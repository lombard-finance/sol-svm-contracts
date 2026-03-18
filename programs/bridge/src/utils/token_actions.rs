use anchor_lang::prelude::*;
use anchor_spl::{associated_token, token_interface};

pub fn execute_mint<'info>(
    token_program: AccountInfo<'info>,
    to: AccountInfo<'info>,
    amount: u64,
    mint: AccountInfo<'info>,
    authority: AccountInfo<'info>,
    token_auth: AccountInfo<'info>,
    bump: u8,
) -> Result<()> {
    let token_authority_sig: &[&[&[u8]]] = &[&[crate::constants::TOKEN_AUTHORITY_SEED, &[bump]]];
    let ix = spl_token_2022::instruction::mint_to(
        &token_program.key(),
        &mint.key(),
        &to.key(),
        &authority.key(),
        &[&token_auth.key()],
        amount,
    )?;
    Ok(anchor_lang::solana_program::program::invoke_signed(
        &ix,
        &[to, mint, authority, token_auth],
        token_authority_sig,
    )?)
}

pub fn execute_burn<'info>(
    token_program: AccountInfo<'info>,
    from: AccountInfo<'info>,
    amount: u64,
    mint: AccountInfo<'info>,
    authority: AccountInfo<'info>,
) -> Result<()> {
    token_interface::burn(
        CpiContext::new(
            token_program,
            token_interface::Burn {
                mint,
                from,
                authority,
            },
        ),
        amount,
    )
}

pub fn get_token_account<'info>(
    token_program: Pubkey,
    mint: Pubkey,
    owner: Pubkey,
) -> Result<Pubkey> {
    Ok(associated_token::get_associated_token_address_with_program_id(&owner, &mint, &token_program), )
}
