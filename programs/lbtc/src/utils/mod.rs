pub(crate) mod actions;
pub(crate) mod bitcoin_utils;
pub(crate) mod decoder;
pub(crate) mod signatures;
pub(crate) mod validation;

use anchor_lang::prelude::*;
use anchor_spl::token_interface;

pub fn execute_mint<'info>(
    token_program: AccountInfo<'info>,
    to: AccountInfo<'info>,
    amount: u64,
    mint: AccountInfo<'info>,
    authority: AccountInfo<'info>,
    bump: u8,
) -> Result<()> {
    let token_authority_sig: &[&[&[u8]]] = &[&[crate::constants::TOKEN_AUTHORITY_SEED, &[bump]]];
    token_interface::mint_to(
        CpiContext::new_with_signer(
            token_program,
            token_interface::MintTo {
                mint,
                to,
                authority,
            },
            token_authority_sig,
        ),
        amount,
    )
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
