//! Implements the Lombard Finance protocol on Solana.
mod bitcoin_utils;
mod consortium;
mod decoder;
pub mod errors;

use anchor_lang::prelude::*;
use anchor_spl::token_interface::{self, TokenAccount, TokenInterface};
use decoder::ValsetAction;
use errors::LBTCError;
use solana_program::{
    clock::Clock, hash::Hash, keccak::Hash as KeccakHash, secp256k1_recover::secp256k1_recover,
};

declare_id!("DG958H3tYj3QWTDPjsisb9CxS6TpdMUznYpgVg5bRd8P");

const TOKEN_AUTHORITY_SEED: &[u8] = b"token_authority";
const MIN_VALIDATOR_SET_SIZE: usize = 1;
const MAX_VALIDATOR_SET_SIZE: usize = 102;

#[program]
pub mod lbtc {
    use super::*;

    pub fn initialize(_ctx: Context<Initialize>) -> Result<()> {
        Ok(())
    }

    pub fn mint_from_payload(
        ctx: Context<MintFromPayload>,
        mint_payload: Vec<u8>,
        signatures: Vec<u8>,
        mint_payload_hash: [u8; 32],
    ) -> Result<()> {
        let amount = validate_mint(
            &ctx.accounts.config,
            &ctx.accounts.recipient,
            &mut ctx.accounts.used,
            mint_payload,
            signatures,
            mint_payload_hash,
        )?;

        execute_mint(
            ctx.accounts.token_program.to_account_info(),
            ctx.accounts.recipient.to_account_info(),
            amount,
            ctx.accounts.token_mint.to_account_info(),
            ctx.accounts.token_authority.to_account_info(),
            ctx.bumps.token_authority,
        )
    }

    pub fn redeem(ctx: Context<Redeem>, script_pubkey: Vec<u8>, amount: u64) -> Result<()> {
        require!(
            ctx.accounts.config.withdrawals_enabled,
            LBTCError::WithdrawalsDisabled
        );
        require!(
            ctx.accounts.treasury.key() == ctx.accounts.config.treasury,
            LBTCError::InvalidTreasury
        );

        let fee = ctx.accounts.config.burn_commission;
        let dust_limit = bitcoin_utils::get_dust_limit_for_output(
            script_pubkey,
            ctx.accounts.config.dust_fee_rate,
        )?;
        require!(amount > fee, LBTCError::FeeGTEAmount);
        require!(amount - fee > dust_limit, LBTCError::AmountBelowDustLimit);

        execute_burn(
            ctx.accounts.token_program.to_account_info(),
            ctx.accounts.payer.to_account_info(),
            amount,
            ctx.accounts.token_mint.to_account_info(),
            ctx.accounts.token_authority.to_account_info(),
            ctx.bumps.token_authority,
        )?;
        execute_mint(
            ctx.accounts.token_program.to_account_info(),
            ctx.accounts.treasury.to_account_info(),
            fee,
            ctx.accounts.token_mint.to_account_info(),
            ctx.accounts.token_authority.to_account_info(),
            ctx.bumps.token_authority,
        )
    }

    pub fn mint(ctx: Context<Mint>, amount: u64) -> Result<()> {
        require!(
            ctx.accounts
                .config
                .minters
                .iter()
                .any(|&minter| minter == ctx.accounts.payer.key()),
            LBTCError::Unauthorized
        );

        execute_mint(
            ctx.accounts.token_program.to_account_info(),
            ctx.accounts.recipient.to_account_info(),
            amount,
            ctx.accounts.token_mint.to_account_info(),
            ctx.accounts.token_authority.to_account_info(),
            ctx.bumps.token_authority,
        )
    }

    pub fn burn(ctx: Context<Mint>, amount: u64) -> Result<()> {
        require!(
            ctx.accounts
                .config
                .minters
                .iter()
                .any(|&minter| minter == ctx.accounts.payer.key()),
            LBTCError::Unauthorized
        );

        execute_burn(
            ctx.accounts.token_program.to_account_info(),
            ctx.accounts.recipient.to_account_info(),
            amount,
            ctx.accounts.token_mint.to_account_info(),
            ctx.accounts.token_authority.to_account_info(),
            ctx.bumps.token_authority,
        )
    }

    pub fn mint_with_fee(
        ctx: Context<MintWithFee>,
        mint_payload: Vec<u8>,
        signatures: Vec<u8>,
        mint_payload_hash: [u8; 32],
        fee_payload: Vec<u8>,
        fee_signature: [u8; 64],
        fee_pubkey: [u8; 64],
    ) -> Result<()> {
        require!(
            ctx.accounts
                .config
                .claimers
                .iter()
                .any(|&claimer| claimer == ctx.accounts.payer.key()),
            LBTCError::Unauthorized
        );

        let amount = validate_mint(
            &ctx.accounts.config,
            &ctx.accounts.recipient,
            &mut ctx.accounts.used,
            mint_payload,
            signatures,
            mint_payload_hash,
        )?;

        let fee = validate_fee(&ctx.accounts.config, fee_payload, fee_signature, fee_pubkey)?;
        require!(fee < amount, LBTCError::FeeGTEAmount);

        execute_mint(
            ctx.accounts.token_program.to_account_info(),
            ctx.accounts.treasury.to_account_info(),
            fee,
            ctx.accounts.token_mint.to_account_info(),
            ctx.accounts.token_authority.to_account_info(),
            ctx.bumps.token_authority,
        )?;
        execute_mint(
            ctx.accounts.token_program.to_account_info(),
            ctx.accounts.recipient.to_account_info(),
            amount - fee,
            ctx.accounts.token_mint.to_account_info(),
            ctx.accounts.token_authority.to_account_info(),
            ctx.bumps.token_authority,
        )
    }

    pub fn set_initial_valset(ctx: Context<Admin>, valset_payload: Vec<u8>) -> Result<()> {
        let valset_action = validate_valset(&ctx.accounts.config, &valset_payload)?;
        require!(
            ctx.accounts.config.epoch == 0,
            LBTCError::ValidatorSetAlreadySet
        );
        require!(valset_action.epoch != 0, LBTCError::InvalidEpoch);

        ctx.accounts.config.epoch = valset_action.epoch;
        ctx.accounts.config.validators = valset_action.validators;
        ctx.accounts.config.weights = valset_action.weights;
        ctx.accounts.config.weight_threshold = valset_action.weight_threshold;
        Ok(())
    }

    pub fn set_next_valset(
        ctx: Context<Cfg>,
        valset_payload: Vec<u8>,
        signatures: Vec<u8>,
    ) -> Result<()> {
        let valset_action = validate_valset(&ctx.accounts.config, &valset_payload)?;
        let signatures = decoder::decode_signatures(&signatures)?;
        require!(ctx.accounts.config.epoch != 0, LBTCError::NoValidatorSet);
        require!(
            valset_action.epoch == ctx.accounts.config.epoch + 1,
            LBTCError::InvalidEpoch
        );

        let payload_hash = Hash::new(&valset_payload).to_bytes();
        consortium::check_signatures(
            ctx.accounts.config.epoch,
            &ctx.accounts.config.validators,
            &ctx.accounts.config.weights,
            ctx.accounts.config.weight_threshold,
            signatures,
            payload_hash,
        )?;

        ctx.accounts.config.epoch = valset_action.epoch;
        ctx.accounts.config.validators = valset_action.validators;
        ctx.accounts.config.weights = valset_action.weights;
        ctx.accounts.config.weight_threshold = valset_action.weight_threshold;
        Ok(())
    }

    pub fn toggle_withdrawals(ctx: Context<Admin>) -> Result<()> {
        ctx.accounts.config.withdrawals_enabled = !ctx.accounts.config.withdrawals_enabled;
        Ok(())
    }

    pub fn toggle_bascule(ctx: Context<Admin>) -> Result<()> {
        ctx.accounts.config.bascule_enabled = !ctx.accounts.config.bascule_enabled;
        Ok(())
    }

    pub fn set_mint_fee(ctx: Context<Operator>, mint_fee: u64) -> Result<()> {
        ctx.accounts.config.mint_fee = mint_fee;
        Ok(())
    }

    pub fn set_burn_commission(ctx: Context<Admin>, commission: u64) -> Result<()> {
        ctx.accounts.config.burn_commission = commission;
        Ok(())
    }

    pub fn set_pauser(ctx: Context<Admin>, pauser: Pubkey) -> Result<()> {
        ctx.accounts.config.pauser = pauser;
        Ok(())
    }

    pub fn set_operator(ctx: Context<Admin>, operator: Pubkey) -> Result<()> {
        ctx.accounts.config.operator = operator;
        Ok(())
    }

    pub fn set_bascule(ctx: Context<Admin>, bascule: Pubkey) -> Result<()> {
        ctx.accounts.config.bascule = bascule;
        Ok(())
    }

    pub fn set_dust_fee_rate(ctx: Context<Admin>, rate: u64) -> Result<()> {
        ctx.accounts.config.dust_fee_rate = rate;
        Ok(())
    }

    pub fn set_chain_id(ctx: Context<Admin>, chain_id: [u8; 32]) -> Result<()> {
        ctx.accounts.config.chain_id = chain_id;
        Ok(())
    }

    pub fn set_deposit_btc_action(ctx: Context<Admin>, action: u32) -> Result<()> {
        ctx.accounts.config.deposit_btc_action = action;
        Ok(())
    }

    pub fn set_valset_action(ctx: Context<Admin>, action: u32) -> Result<()> {
        ctx.accounts.config.set_valset_action = action;
        Ok(())
    }

    pub fn set_fee_approval_action(ctx: Context<Admin>, action: u32) -> Result<()> {
        ctx.accounts.config.fee_approval_action = action;
        Ok(())
    }

    pub fn set_treasury(ctx: Context<Admin>, treasury: Pubkey) -> Result<()> {
        ctx.accounts.config.treasury = treasury;
        Ok(())
    }
}

fn validate_mint(
    config: &Account<'_, Config>,
    recipient: &InterfaceAccount<'_, TokenAccount>,
    used: &mut Account<'_, Used>,
    mint_payload: Vec<u8>,
    signatures: Vec<u8>,
    mint_payload_hash: [u8; 32],
) -> Result<u64> {
    let mint_action = decoder::decode_mint_action(&mint_payload)?;
    if mint_action.recipient != recipient.key() {
        return err!(LBTCError::RecipientMismatch);
    }

    require!(
        mint_action.action == config.deposit_btc_action,
        LBTCError::InvalidActionBytes
    );
    require!(
        mint_action.to_chain == config.chain_id,
        LBTCError::InvalidChainID
    );

    let payload_hash = Hash::new(&mint_payload).to_bytes();
    if payload_hash != mint_payload_hash {
        return err!(LBTCError::MintPayloadHashMismatch);
    }

    let signatures = decoder::decode_signatures(&signatures)?;
    consortium::check_signatures(
        config.epoch,
        &config.validators,
        &config.weights,
        config.weight_threshold,
        signatures,
        payload_hash,
    )?;

    if used.used {
        return err!(LBTCError::MintPayloadUsed);
    } else {
        used.used = true;
    }

    // Confirm deposit against bascule, if using.
    if config.bascule_enabled {
        // TODO
        // This is empty for now, while Bascule is being implemented as a Solana program.
    }

    Ok(mint_action.amount)
}

fn validate_fee(
    config: &Account<'_, Config>,
    fee_payload: Vec<u8>,
    fee_signature: [u8; 64],
    fee_pubkey: [u8; 64],
) -> Result<u64> {
    let fee_action = decoder::decode_fee_action(&fee_payload)?;
    require!(
        fee_action.action == config.fee_approval_action,
        LBTCError::InvalidActionBytes
    );

    // Select correct fee
    let fee = if fee_action.fee > config.mint_fee {
        config.mint_fee
    } else {
        fee_action.fee
    };

    // Check expiry
    let clock = Clock::get()?;
    if clock.unix_timestamp as u64 > fee_action.expiry {
        return err!(LBTCError::FeeApprovalExpired);
    }

    // Check signature
    let hash = KeccakHash::new(&fee_payload).to_bytes();
    consortium::check_signatures(1, &[fee_pubkey], &[1], 1, vec![fee_signature], hash)?;
    Ok(fee)
}

fn validate_valset(config: &Account<'_, Config>, valset_payload: &[u8]) -> Result<ValsetAction> {
    let valset_action = decoder::decode_valset_action(valset_payload)?;
    require!(
        valset_action.action == config.set_valset_action,
        LBTCError::InvalidActionBytes
    );
    require!(
        valset_action.validators.len() >= MIN_VALIDATOR_SET_SIZE,
        LBTCError::InvalidValidatorSetSize
    );
    require!(
        valset_action.validators.len() <= MAX_VALIDATOR_SET_SIZE,
        LBTCError::InvalidValidatorSetSize
    );
    require!(
        valset_action.weight_threshold > 0,
        LBTCError::InvalidWeightThreshold
    );
    require!(
        valset_action.validators.len() == valset_action.weights.len(),
        LBTCError::ValidatorsAndWeightsMismatch
    );

    let mut sum = 0;
    for weight in &valset_action.weights {
        require!(*weight > 0, LBTCError::ZeroWeight);
        sum += weight;
    }

    require!(
        sum >= valset_action.weight_threshold,
        LBTCError::WeightsBelowThreshold
    );
    Ok(valset_action)
}

fn execute_mint<'info>(
    token_program: AccountInfo<'info>,
    to: AccountInfo<'info>,
    amount: u64,
    mint: AccountInfo<'info>,
    authority: AccountInfo<'info>,
    token_authority_bump: u8,
) -> Result<()> {
    let token_authority_sig: &[&[&[u8]]] = &[&[TOKEN_AUTHORITY_SEED, &[token_authority_bump]]];
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

fn execute_burn<'info>(
    token_program: AccountInfo<'info>,
    from: AccountInfo<'info>,
    amount: u64,
    mint: AccountInfo<'info>,
    authority: AccountInfo<'info>,
    token_authority_bump: u8,
) -> Result<()> {
    let token_authority_sig: &[&[&[u8]]] = &[&[TOKEN_AUTHORITY_SEED, &[token_authority_bump]]];
    token_interface::burn(
        CpiContext::new_with_signer(
            token_program,
            token_interface::Burn {
                mint,
                from,
                authority,
            },
            token_authority_sig,
        ),
        amount,
    )
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(
        init,
        payer = payer,
        space = 8 + Config::INIT_SPACE
    )]
    pub config: Account<'info, Config>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Cfg<'info> {
    pub config: Account<'info, Config>,
}

#[derive(Accounts)]
#[instruction(mint_payload_hash: Vec<u8>)]
pub struct MintFromPayload<'info> {
    pub config: Account<'info, Config>,
    pub token_program: Interface<'info, TokenInterface>,
    pub recipient: InterfaceAccount<'info, TokenAccount>,
    pub token_mint: InterfaceAccount<'info, TokenAccount>,
    #[account(
        seeds = [TOKEN_AUTHORITY_SEED],
        bump,
    )]
    pub token_authority: InterfaceAccount<'info, TokenAccount>,
    #[account(mut, seeds = [&mint_payload_hash], bump)]
    pub used: Account<'info, Used>,
}

#[derive(Accounts)]
pub struct Mint<'info> {
    pub payer: Signer<'info>,
    pub config: Account<'info, Config>,
    pub token_program: Interface<'info, TokenInterface>,
    pub recipient: InterfaceAccount<'info, TokenAccount>,
    pub token_mint: InterfaceAccount<'info, TokenAccount>,
    #[account(
        seeds = [TOKEN_AUTHORITY_SEED],
        bump,
    )]
    pub token_authority: InterfaceAccount<'info, TokenAccount>,
}

#[derive(Accounts)]
#[instruction(mint_payload_hash: Vec<u8>)]
pub struct MintWithFee<'info> {
    pub payer: Signer<'info>,
    pub config: Account<'info, Config>,
    pub token_program: Interface<'info, TokenInterface>,
    pub recipient: InterfaceAccount<'info, TokenAccount>,
    pub token_mint: InterfaceAccount<'info, TokenAccount>,
    #[account(
        seeds = [TOKEN_AUTHORITY_SEED],
        bump,
    )]
    pub token_authority: InterfaceAccount<'info, TokenAccount>,
    pub treasury: InterfaceAccount<'info, TokenAccount>,
    #[account(mut, seeds = [&mint_payload_hash], bump)]
    pub used: Account<'info, Used>,
}

#[derive(Accounts)]
pub struct Redeem<'info> {
    pub payer: Signer<'info>,
    pub config: Account<'info, Config>,
    pub token_program: Interface<'info, TokenInterface>,
    pub token_mint: InterfaceAccount<'info, TokenAccount>,
    #[account(
        seeds = [TOKEN_AUTHORITY_SEED],
        bump,
    )]
    pub token_authority: InterfaceAccount<'info, TokenAccount>,
    pub treasury: InterfaceAccount<'info, TokenAccount>,
}

#[derive(Accounts)]
pub struct CfgWithSigner<'info> {
    pub payer: Signer<'info>,
    pub config: Account<'info, Config>,
}

#[derive(Accounts)]
pub struct Admin<'info> {
    #[account(address = config.admin)]
    pub payer: Signer<'info>,
    pub config: Account<'info, Config>,
}

#[derive(Accounts)]
pub struct Pauser<'info> {
    #[account(address = config.pauser)]
    pub payer: Signer<'info>,
    pub config: Account<'info, Config>,
}

#[derive(Accounts)]
pub struct Operator<'info> {
    #[account(address = config.operator)]
    pub payer: Signer<'info>,
    pub config: Account<'info, Config>,
}

#[account]
#[derive(InitSpace)]
pub struct Config {
    // Authorities
    pub admin: Pubkey,
    pub pauser: Pubkey,
    pub operator: Pubkey,
    pub treasury: Pubkey,
    #[max_len(100)]
    pub minters: Vec<Pubkey>,
    #[max_len(100)]
    pub claimers: Vec<Pubkey>,

    // Decoder fields
    pub chain_id: [u8; 32],
    pub deposit_btc_action: u32,
    pub set_valset_action: u32,
    pub fee_approval_action: u32,

    // Mint/redeem fields
    pub burn_commission: u64,
    pub withdrawals_enabled: bool,
    pub dust_fee_rate: u64,
    pub bascule_enabled: bool,
    pub bascule: Pubkey,

    // Global pause
    pub paused: bool,

    // Automint fields
    pub mint_fee: u64,

    // Consortium fields
    pub epoch: u64,
    #[max_len(102)]
    pub validators: Vec<[u8; 64]>,
    #[max_len(102)]
    pub weights: Vec<u64>,
    pub weight_threshold: u64,
}

#[account]
pub struct Used {
    used: bool,
}
