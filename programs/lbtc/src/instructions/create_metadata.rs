//! Allows admin to set token metadata.
use crate::{constants, state::Config};
use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, TokenInterface};
use mpl_token_metadata::{
    instructions::{CreateV1Cpi, CreateV1CpiAccounts, CreateV1InstructionArgs},
    types::TokenStandard,
};

#[derive(Accounts)]
pub struct CreateMetadata<'info> {
    #[account(mut, address = config.admin)]
    pub payer: Signer<'info>,
    #[account(mut, seeds = [constants::CONFIG_SEED], bump)]
    pub config: Account<'info, Config>,
    pub token_program: Interface<'info, TokenInterface>,
    /// CHECK: The call will fail if the wrong metadata program is passed.
    pub metadata_program: UncheckedAccount<'info>,
    /// CHECK: The call will fail if the metadata PDA is improperly derived.
    #[account(mut)]
    pub metadata_pda: UncheckedAccount<'info>,
    #[account(mut, address = config.mint)]
    pub mint: InterfaceAccount<'info, Mint>,
    /// CHECK: This being used in the create call constrains it to be correct, otherwise the
    /// instruction will fail.
    pub mint_authority: UncheckedAccount<'info>,
    /// CHECK: The seeds constraint ensures the correct address is passed.
    #[account(seeds = [crate::constants::TOKEN_AUTHORITY_SEED], bump)]
    pub token_authority: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
    /// CHECK: The call will fail if the wrong sysvar account is passed.
    pub sysvar_instructions: UncheckedAccount<'info>,
}

pub fn create_metadata(ctx: Context<CreateMetadata>) -> Result<()> {
    let args = CreateV1InstructionArgs {
        name: "Lombard Staked BTC".to_string(),
        symbol: "LBTC".to_string(),
        uri: "https://raw.githubusercontent.com/lombard-finance/sol-svm-contracts/refs/heads/main/.assets/lbtc.json"
            .to_string(),
        seller_fee_basis_points: 0,
        primary_sale_happened: false,
        is_mutable: true, // Ensure updatability of metadata in the future
        token_standard: TokenStandard::Fungible,
        collection: None,
        uses: None,
        collection_details: None,
        creators: None,
        rule_set: None,
        decimals: Some(8),
        print_supply: None,
    };

    let metadata_program = ctx.accounts.metadata_program.to_account_info();
    let metadata = ctx.accounts.metadata_pda.to_account_info();
    let mint = ctx.accounts.mint.to_account_info();
    let authority = ctx.accounts.mint_authority.to_account_info();
    let payer = ctx.accounts.payer.to_account_info();
    let spl_token_program = ctx.accounts.token_program.to_account_info();
    let system_program = ctx.accounts.system_program.to_account_info();
    let sysvar_instructions = ctx.accounts.sysvar_instructions.to_account_info();

    let cpi_create = CreateV1Cpi::new(
        &metadata_program,
        CreateV1CpiAccounts {
            metadata: &metadata,
            master_edition: None,
            mint: (&mint, false),
            authority: &authority,
            payer: &payer,
            update_authority: (&payer, true),
            spl_token_program: Some(&spl_token_program),
            system_program: &system_program,
            sysvar_instructions: &sysvar_instructions,
        },
        args,
    );

    let token_authority_sig: &[&[&[u8]]] = &[&[
        crate::constants::TOKEN_AUTHORITY_SEED,
        &[ctx.bumps.token_authority],
    ]];
    Ok(cpi_create.invoke_signed(token_authority_sig)?)
}
