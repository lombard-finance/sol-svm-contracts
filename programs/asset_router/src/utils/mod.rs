// pub(crate) mod fee;
pub(crate) mod bitcoin_utils;
pub(crate) mod consortium_payloads;
pub(crate) mod ed25519;
pub(crate) mod fee;
pub(crate) mod gmp_messages;

use anchor_lang::prelude::*;
use anchor_spl::token_interface;

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
