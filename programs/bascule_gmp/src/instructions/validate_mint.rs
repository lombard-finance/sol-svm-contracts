use anchor_lang::prelude::*;

use crate::constants::{ACCOUNT_ROLES_SEED, CONFIG_SEED, MINT_PAYLOAD_SEED};
use crate::errors::BasculeGmpError;
use crate::events::MintValidated;
use crate::state::{
    AccountRole, AccountRoles, Config, MintMessage, MintPayload, MintPayloadState,
};

#[derive(Accounts)]
#[instruction(mint_message: MintMessage)]
pub struct ValidateMint<'info> {
    pub validator: Signer<'info>,
    /// Pays for the 'Deposit' account creation if the account does not already exist; can be any account
    #[account(mut)]
    payer: Signer<'info>,
    #[account(
        constraint = config.paused == false @ BasculeGmpError::Paused,
        seeds = [CONFIG_SEED],
        bump
    )]
    pub config: Account<'info, Config>,
    #[account(
        constraint = account_roles.has_role(AccountRole::MintValidator) @ BasculeGmpError::Unauthorized,
        seeds = [ACCOUNT_ROLES_SEED, validator.key().as_ref()],
        bump
    )]
    pub account_roles: Account<'info, AccountRoles>,
    #[account(
        init_if_needed,
        payer = payer,
        space = 8 + MintPayload::INIT_SPACE,
        seeds = [MINT_PAYLOAD_SEED, &mint_message.mint_id()],
        bump
    )]
    pub mint_payload: Account<'info, MintPayload>,
    pub system_program: Program<'info, System>,
}

pub fn validate_mint(ctx: Context<ValidateMint>, mint_message: MintMessage) -> Result<()> {
    let mint_id = mint_message.mint_id();
    let config = &ctx.accounts.config;
    let mint_payload = &mut ctx.accounts.mint_payload;
    let threshold = config.validate_threshold;
    let amount = mint_message.amount;

    if mint_payload.state == MintPayloadState::Minted {
        return Err(BasculeGmpError::AlreadyMinted.into());
    }

    let previous_state = mint_payload.state;

    if amount >= threshold {
        require!(
            mint_payload.state == MintPayloadState::Reported,
            BasculeGmpError::MustBeReportedWhenAboveThreshold
        );
        mint_payload.amount = amount;
    } else {
        mint_payload.amount = amount;
    }

    mint_payload.state = MintPayloadState::Minted;
    emit!(MintValidated {
        mint_id,
        previous_state,
        amount,
    });
    Ok(())
}
