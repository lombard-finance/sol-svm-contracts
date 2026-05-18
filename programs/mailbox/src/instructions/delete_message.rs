use anchor_lang::prelude::*;

use crate::constants::{CONFIG_SEED, OUTBOUND_MESSAGE};
use crate::errors::MailboxError;
use crate::state::Config;

#[derive(Accounts)]
#[instruction(nonce: u64)]
pub struct DeleteMessage<'info> {
    #[account(mut, address = config.admin)]
    pub payer: Signer<'info>,
    #[account(
        mut,
        constraint = config.paused == false @ MailboxError::Paused,
        seeds = [CONFIG_SEED],
        bump
    )]
    pub config: Account<'info, Config>,
    /// CHECK: PDA seed-verified outbound message account; data is wiped and account
    /// is reassigned to the System Program before this instruction returns.
    #[account(
        mut,
        seeds = [OUTBOUND_MESSAGE, &nonce.to_be_bytes()],
        bump
    )]
    pub outbound_message: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

pub fn delete_message(ctx: Context<DeleteMessage>, _nonce: u64) -> Result<()> {
    let data_account = ctx.accounts.outbound_message.to_account_info();
    let dest_account = ctx.accounts.payer.to_account_info();

    let amount = data_account.lamports();
    **dest_account.try_borrow_mut_lamports()? = dest_account
        .lamports()
        .checked_add(amount)
        .ok_or(ProgramError::ArithmeticOverflow)?;
    **data_account.try_borrow_mut_lamports()? = 0;

    data_account.realloc(0, false)?;
    data_account.assign(&System::id());

    Ok(())
}
