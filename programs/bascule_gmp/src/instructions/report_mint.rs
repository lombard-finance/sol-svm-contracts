use anchor_lang::prelude::*;
use anchor_lang::solana_program::secp256k1_recover::secp256k1_recover;

use crate::constants::{ACCOUNT_ROLES_SEED, CONFIG_SEED, MINT_PAYLOAD_SEED};
use crate::errors::BasculeGmpError;
use crate::events::MintReported;
use crate::state::{
    AccountRole, AccountRoles, Config, MintMessage, MintPayload, MintPayloadState, MintProof,
};

#[derive(Accounts)]
#[instruction(mint_message: MintMessage)]
pub struct ReportMint<'info> {
    #[account(mut)]
    pub reporter: Signer<'info>,
    #[account(
        constraint = config.paused == false @ BasculeGmpError::Paused,
        seeds = [CONFIG_SEED],
        bump
    )]
    pub config: Account<'info, Config>,
    #[account(
        constraint = account_roles.has_role(AccountRole::MintReporter) @ BasculeGmpError::Unauthorized,
        seeds = [ACCOUNT_ROLES_SEED, reporter.key().as_ref()],
        bump
    )]
    pub account_roles: Account<'info, AccountRoles>,
    #[account(
        init,
        payer = reporter,
        space = 8 + MintPayload::INIT_SPACE,
        seeds = [MINT_PAYLOAD_SEED, &mint_message.mint_id()],
        bump
    )]
    pub mint_payload: Account<'info, MintPayload>,
    pub system_program: Program<'info, System>,
}

pub fn report_mint(
    ctx: Context<ReportMint>,
    mint_message: MintMessage,
    proof: MintProof,
) -> Result<()> {
    let mint_id = mint_message.mint_id();
    let trusted_signer = &ctx.accounts.config.trusted_signer;

    let recovered = secp256k1_recover(&mint_id, proof.recovery_id, &proof.signature)
        .map_err(|_| BasculeGmpError::InvalidProof)?;
    require!(
        recovered.to_bytes() == *trusted_signer,
        BasculeGmpError::InvalidProof
    );

    let mint_payload = &mut ctx.accounts.mint_payload;
    mint_payload.state = MintPayloadState::Reported;
    mint_payload.amount = mint_message.amount;
    emit!(MintReported {
        mint_id,
        amount: mint_message.amount,
    });
    Ok(())
}
