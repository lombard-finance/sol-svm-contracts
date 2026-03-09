use anchor_lang::prelude::*;
use anchor_lang::solana_program::{instruction::Instruction, program::{invoke_signed, get_return_data}};
use anchor_spl::token_2022::TransferChecked;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface, transfer_checked};
use base_token_pool::common::LockOrBurnOutV1;

use crate::events::MockCcipOnrampCompleted;
use crate::instructions::LockOrBurnInV1;

#[derive(Accounts)]
#[instruction()]
pub struct ExecuteOnrampContext<'info> {
    #[account(mut)]
    pub sender: Signer<'info>,
    #[account(mut,
        token::mint = mint,
        token::authority = sender,
        token::token_program = token_program,
    )]
    pub sender_token_account: InterfaceAccount<'info, TokenAccount>,
    pub token_program: Interface<'info, TokenInterface>,
    #[account(mut)]
    pub mint: InterfaceAccount<'info, Mint>,
    /// CHECK: maybe add some checks later
    #[account()]
    pub token_pool: UncheckedAccount<'info>,
    #[account(mut,
        // token::mint = mint,
        // token::authority = token_pool,
        // token::token_program = token_program,
    )]
    pub token_pool_token_account: InterfaceAccount<'info, TokenAccount>,
    /// CHECK: maybe add some checks later
    #[account(
        mut,
        seeds = [b"external_token_pools_signer", token_pool.key().as_ref()],
        bump,
    )]
    pub cpi_signer: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>
}

pub fn execute_onramp<'a, 'b, 'c, 'info>(
    ctx: Context<'a, 'b, 'c, 'info, ExecuteOnrampContext<'info>>,
    receiver: Vec<u8>, //  The recipient of the tokens on the destination chain
    remote_chain_selector: u64, // The chain ID of the destination chain
    original_sender: Pubkey, // The original sender of the tx on the source chain
    amount: u64, // local solana amount to lock/burn,  The amount of tokens to lock or burn, denominated in the source token's decimals
    msg_total_nonce: u64,
) -> Result<()> {

    let decimals = ctx.accounts.mint.decimals;

    let cpi_accounts = TransferChecked {
        mint: ctx.accounts.mint.to_account_info(),
        from: ctx.accounts.sender_token_account.to_account_info(),
        to: ctx.accounts.token_pool_token_account.to_account_info(),
        authority: ctx.accounts.sender.to_account_info(),
    };
    let cpi_program = ctx.accounts.token_program.to_account_info();
    let cpi_context = CpiContext::new(cpi_program, cpi_accounts);
    transfer_checked(cpi_context, amount, decimals)?;

    let mut accounts = vec![
        AccountMeta::new(ctx.accounts.cpi_signer.key(), true),
        AccountMeta::new_readonly(ctx.accounts.token_program.key(), false),
        AccountMeta::new(ctx.accounts.mint.key(), false),
    ];
    let mut account_infos = vec![
        ctx.accounts.cpi_signer.to_account_info(),
        ctx.accounts.token_program.to_account_info(),
        ctx.accounts.mint.to_account_info(),
    ];
    ctx.remaining_accounts.iter().for_each(|a| {
        if !a.is_signer {
            accounts.push(match a.is_writable {
                true => AccountMeta::new(a.key(), a.is_signer),
                false => AccountMeta::new_readonly(a.key(), a.is_signer),
            });
            account_infos.push(a.to_account_info());
        }
    });
    let data = LockOrBurnInV1{
        receiver: receiver,
        remote_chain_selector: remote_chain_selector,
        original_sender: original_sender,
        amount: amount,
        local_token: ctx.accounts.mint.key(),
        msg_total_nonce: msg_total_nonce,
    };
    let ix = Instruction {
        program_id: ctx.accounts.token_pool.key(),
        accounts: accounts,
        data: data.to_tx_data(),
    };

    let seeds: &[&[u8]] = &[
        b"external_token_pools_signer",
        ctx.accounts.token_pool.key.as_ref(),
        &[ctx.bumps.cpi_signer],
    ];

    invoke_signed(&ix, &account_infos, &[seeds])?;
    let (_, data) = get_return_data().unwrap();
    let lock_or_burn_out = LockOrBurnOutV1::try_from_slice(&data)?;
    emit!(MockCcipOnrampCompleted {
        bridge_data: lock_or_burn_out.dest_pool_data,
    });

    Ok(())
}
