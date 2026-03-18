use anchor_lang::prelude::*;
use anchor_lang::solana_program::{instruction::Instruction, program::invoke_signed};

use crate::{
    constants::OFFRAMP_DATA_SEED,
    data::ReleaseOrMintInV1,
    state::ReleaseOrMintInV1Data,
};

#[derive(Accounts)]
#[instruction(nonce: u16)]
pub struct ExecuteOfframpContext<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    /// CHECK: maybe add some checks later
    #[account()]
    pub token_pool: UncheckedAccount<'info>,
    /// CHECK: maybe add some checks later
    #[account(
        seeds = [b"external_token_pools_signer", token_pool.key().as_ref()],
        bump,
    )]
    pub cpi_signer: UncheckedAccount<'info>,
    #[account(
        seeds = [OFFRAMP_DATA_SEED, &nonce.to_le_bytes()],
        bump
    )]
    pub offramp_data: Account<'info, ReleaseOrMintInV1Data>,
    pub system_program: Program<'info, System>
}

pub fn execute_offramp<'a, 'b, 'c, 'info>(
    ctx: Context<'a, 'b, 'c, 'info, ExecuteOfframpContext<'info>>,
    nonce: u16,
) -> Result<()> {
    let mut accounts = vec![AccountMeta::new_readonly(ctx.accounts.cpi_signer.key(), true)];
    let mut account_infos = vec![ctx.accounts.cpi_signer.to_account_info()];
    ctx.remaining_accounts.iter().for_each(|a| {
        if !a.is_signer {
            accounts.push(match a.is_writable {
                true => AccountMeta::new(a.key(), a.is_signer),
                false => AccountMeta::new_readonly(a.key(), a.is_signer),
            });
            account_infos.push(a.to_account_info());
        }
    });
    let data = ReleaseOrMintInV1{
        original_sender: ctx.accounts.offramp_data.original_sender.clone(),
        remote_chain_selector: ctx.accounts.offramp_data.remote_chain_selector,
        receiver: ctx.accounts.offramp_data.receiver,
        amount: ctx.accounts.offramp_data.amount,
        local_token: ctx.accounts.offramp_data.local_token,
        source_pool_address: ctx.accounts.offramp_data.source_pool_address.clone(),
        source_pool_data: ctx.accounts.offramp_data.source_pool_data.clone(),
        offchain_token_data: ctx.accounts.offramp_data.offchain_token_data.clone(),
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
    Ok(())
}
