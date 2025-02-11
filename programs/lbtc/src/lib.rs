//! Implements the Lombard Finance protocol on Solana.
mod bitcoin_utils;
mod consortium;
mod decoder;
pub mod errors;

use anchor_lang::prelude::*;
use anchor_spl::token_interface::{self, TokenAccount, TokenInterface};
use decoder::ValsetAction;
use errors::LBTCError;
use solana_ed25519_verify::verify_signature;
use solana_program::{clock::Clock, hash::Hash};

declare_id!("5WFmz89q5RzSezsDQNCWoCJTEdYgne5u26kJPCyWvCEx");

const TOKEN_AUTHORITY_SEED: &[u8] = b"token_authority";
const MIN_VALIDATOR_SET_SIZE: usize = 1;
const MAX_VALIDATOR_SET_SIZE: usize = 102;

#[program]
pub mod lbtc {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>, admin: Pubkey) -> Result<()> {
        ctx.accounts.config.admin = admin;
        Ok(())
    }

    pub fn mint_from_payload(
        ctx: Context<MintFromPayload>,
        mint_payload: Vec<u8>,
        signatures: Vec<u8>,
        mint_payload_hash: [u8; 32],
    ) -> Result<()> {
        require!(!ctx.accounts.config.paused, LBTCError::Paused);
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
        require!(!ctx.accounts.config.paused, LBTCError::Paused);
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
            &script_pubkey,
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
        )?;

        emit!(UnstakeRequest {
            from: ctx.accounts.payer.key(),
            script_pubkey,
            amount,
        });
        Ok(())
    }

    pub fn mint(ctx: Context<Mint>, amount: u64) -> Result<()> {
        require!(!ctx.accounts.config.paused, LBTCError::Paused);
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
        require!(!ctx.accounts.config.paused, LBTCError::Paused);
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
    ) -> Result<()> {
        require!(!ctx.accounts.config.paused, LBTCError::Paused);
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

        let fee = validate_fee(
            &ctx.accounts.config,
            &ctx.accounts.recipient.to_account_info(),
            fee_payload,
            fee_signature,
        )?;
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

        ctx.accounts.config.epoch = valset_action.epoch.clone();
        ctx.accounts.config.validators = valset_action.validators.clone();
        ctx.accounts.config.weights = valset_action.weights.clone();
        ctx.accounts.config.weight_threshold = valset_action.weight_threshold.clone();
        emit!(ValidatorSetUpdated {
            epoch: valset_action.epoch,
            validators: valset_action.validators,
            weights: valset_action.weights,
            weight_threshold: valset_action.weight_threshold,
        });
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

        ctx.accounts.config.epoch = valset_action.epoch.clone();
        ctx.accounts.config.validators = valset_action.validators.clone();
        ctx.accounts.config.weights = valset_action.weights.clone();
        ctx.accounts.config.weight_threshold = valset_action.weight_threshold.clone();
        emit!(ValidatorSetUpdated {
            epoch: valset_action.epoch,
            validators: valset_action.validators,
            weights: valset_action.weights,
            weight_threshold: valset_action.weight_threshold,
        });
        Ok(())
    }

    pub fn toggle_withdrawals(ctx: Context<Admin>) -> Result<()> {
        ctx.accounts.config.withdrawals_enabled = !ctx.accounts.config.withdrawals_enabled;
        emit!(WithdrawalsEnabled {
            enabled: ctx.accounts.config.withdrawals_enabled
        });
        Ok(())
    }

    pub fn toggle_bascule(ctx: Context<Admin>) -> Result<()> {
        ctx.accounts.config.bascule_enabled = !ctx.accounts.config.bascule_enabled;
        emit!(BasculeEnabled {
            enabled: ctx.accounts.config.bascule_enabled,
        });
        Ok(())
    }

    pub fn set_mint_fee(ctx: Context<Operator>, mint_fee: u64) -> Result<()> {
        ctx.accounts.config.mint_fee = mint_fee;
        emit!(MintFeeSet { mint_fee });
        Ok(())
    }

    pub fn set_burn_commission(ctx: Context<Admin>, commission: u64) -> Result<()> {
        ctx.accounts.config.burn_commission = commission;
        emit!(BurnCommissionSet {
            burn_commission: commission
        });
        Ok(())
    }

    pub fn set_operator(ctx: Context<Admin>, operator: Pubkey) -> Result<()> {
        ctx.accounts.config.operator = operator;
        emit!(OperatorSet { operator });
        Ok(())
    }

    pub fn set_bascule(ctx: Context<Admin>, bascule: Pubkey) -> Result<()> {
        ctx.accounts.config.bascule = bascule;
        emit!(BasculeAddressChanged { address: bascule });
        Ok(())
    }

    pub fn set_dust_fee_rate(ctx: Context<Admin>, rate: u64) -> Result<()> {
        ctx.accounts.config.dust_fee_rate = rate;
        emit!(DustFeeRateSet { rate });
        Ok(())
    }

    pub fn set_chain_id(ctx: Context<Admin>, chain_id: [u8; 32]) -> Result<()> {
        ctx.accounts.config.chain_id = chain_id;
        emit!(ChainIdSet { chain_id });
        Ok(())
    }

    pub fn set_deposit_btc_action(ctx: Context<Admin>, action: u32) -> Result<()> {
        ctx.accounts.config.deposit_btc_action = action;
        emit!(DepositBtcActionSet { action });
        Ok(())
    }

    pub fn set_valset_action(ctx: Context<Admin>, action: u32) -> Result<()> {
        ctx.accounts.config.set_valset_action = action;
        emit!(ValsetActionSet { action });
        Ok(())
    }

    pub fn set_fee_approval_action(ctx: Context<Admin>, action: u32) -> Result<()> {
        ctx.accounts.config.fee_approval_action = action;
        emit!(FeeActionSet { action });
        Ok(())
    }

    pub fn set_treasury(ctx: Context<Admin>, treasury: Pubkey) -> Result<()> {
        ctx.accounts.config.treasury = treasury;
        emit!(TreasuryChanged { address: treasury });
        Ok(())
    }

    pub fn add_minter(ctx: Context<Admin>, minter: Pubkey) -> Result<()> {
        ctx.accounts.config.minters.push(minter);
        emit!(MinterAdded { minter });
        Ok(())
    }

    pub fn remove_minter(ctx: Context<Admin>, minter: Pubkey) -> Result<()> {
        let mut found = false;
        let mut index = 0;
        for (i, m) in ctx.accounts.config.minters.iter().enumerate() {
            if *m == minter {
                found = true;
                index = i;
            }
        }

        if found {
            ctx.accounts.config.minters.swap_remove(index);
            emit!(MinterRemoved { minter });
        }
        Ok(())
    }

    pub fn add_claimer(ctx: Context<Admin>, claimer: Pubkey) -> Result<()> {
        ctx.accounts.config.claimers.push(claimer);
        emit!(ClaimerAdded { claimer });
        Ok(())
    }

    pub fn remove_claimer(ctx: Context<Admin>, claimer: Pubkey) -> Result<()> {
        let mut found = false;
        let mut index = 0;
        for (i, c) in ctx.accounts.config.claimers.iter().enumerate() {
            if *c == claimer {
                found = true;
                index = i;
            }
        }

        if found {
            ctx.accounts.config.claimers.swap_remove(index);
            emit!(ClaimerRemoved { claimer });
        }
        Ok(())
    }

    pub fn add_pauser(ctx: Context<Admin>, pauser: Pubkey) -> Result<()> {
        ctx.accounts.config.pausers.push(pauser);
        emit!(PauserAdded { pauser });
        Ok(())
    }

    pub fn remove_pauser(ctx: Context<Admin>, pauser: Pubkey) -> Result<()> {
        let mut found = false;
        let mut index = 0;
        for (i, p) in ctx.accounts.config.pausers.iter().enumerate() {
            if *p == pauser {
                found = true;
                index = i;
            }
        }

        if found {
            ctx.accounts.config.pausers.swap_remove(index);
            emit!(PauserRemoved { pauser });
        }
        Ok(())
    }

    pub fn pause(ctx: Context<CfgWithSigner>) -> Result<()> {
        require!(
            ctx.accounts
                .config
                .pausers
                .iter()
                .any(|pauser| *pauser == ctx.accounts.payer.key()),
            LBTCError::Unauthorized
        );
        ctx.accounts.config.paused = true;
        emit!(PauseEnabled { enabled: true });
        Ok(())
    }

    pub fn unpause(ctx: Context<Admin>) -> Result<()> {
        ctx.accounts.config.paused = false;
        emit!(PauseEnabled { enabled: false });
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

    emit!(MintProofConsumed {
        recipient: mint_action.recipient,
        payload_hash,
        payload: mint_payload,
    });
    Ok(mint_action.amount)
}

fn validate_fee<'info>(
    config: &Account<'info, Config>,
    recipient: &AccountInfo<'info>,
    fee_payload: Vec<u8>,
    fee_signature: [u8; 64],
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
    // Since the caller will not be the recipient, we can not use the ed25519 instruction 'hack'
    // and unfortunately have to use this more expensive external crate.
    if verify_signature(&recipient.key(), &fee_signature, &fee_payload)
        .map_err(|_| LBTCError::InvalidFeeSignature)?
    {
        Ok(fee)
    } else {
        err!(LBTCError::InvalidFeeSignature)
    }
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
        seeds = [b"lbtc_config"],
        bump,
        payer = payer,
        space = 8 + Config::INIT_SPACE
    )]
    pub config: Account<'info, Config>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Cfg<'info> {
    #[account(mut)]
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
    #[account(mut)]
    pub config: Account<'info, Config>,
}

#[derive(Accounts)]
pub struct Admin<'info> {
    #[account(address = config.admin)]
    pub payer: Signer<'info>,
    #[account(mut)]
    pub config: Account<'info, Config>,
}

#[derive(Accounts)]
pub struct Operator<'info> {
    #[account(address = config.operator)]
    pub payer: Signer<'info>,
    #[account(mut)]
    pub config: Account<'info, Config>,
}

#[account]
#[derive(InitSpace)]
pub struct Config {
    // Authorities
    pub admin: Pubkey,
    pub operator: Pubkey,
    pub treasury: Pubkey,
    #[max_len(10)]
    pub minters: Vec<Pubkey>,
    #[max_len(10)]
    pub claimers: Vec<Pubkey>,
    #[max_len(10)]
    pub pausers: Vec<Pubkey>,

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

#[event]
pub struct WithdrawalsEnabled {
    enabled: bool,
}

#[event]
pub struct BasculeEnabled {
    enabled: bool,
}

#[event]
pub struct MintFeeSet {
    mint_fee: u64,
}

#[event]
pub struct BurnCommissionSet {
    burn_commission: u64,
}

#[event]
pub struct OperatorSet {
    operator: Pubkey,
}

#[event]
pub struct BasculeAddressChanged {
    address: Pubkey,
}

#[event]
pub struct DustFeeRateSet {
    rate: u64,
}

#[event]
pub struct ChainIdSet {
    chain_id: [u8; 32],
}

#[event]
pub struct DepositBtcActionSet {
    action: u32,
}

#[event]
pub struct ValsetActionSet {
    action: u32,
}

#[event]
pub struct FeeActionSet {
    action: u32,
}

#[event]
pub struct TreasuryChanged {
    address: Pubkey,
}

#[event]
pub struct MinterAdded {
    minter: Pubkey,
}

#[event]
pub struct MinterRemoved {
    minter: Pubkey,
}

#[event]
pub struct ClaimerAdded {
    claimer: Pubkey,
}

#[event]
pub struct ClaimerRemoved {
    claimer: Pubkey,
}

#[event]
pub struct PauserAdded {
    pauser: Pubkey,
}

#[event]
pub struct PauserRemoved {
    pauser: Pubkey,
}

#[event]
pub struct PauseEnabled {
    enabled: bool,
}

#[event]
pub struct ValidatorSetUpdated {
    epoch: u64,
    validators: Vec<[u8; 64]>,
    weights: Vec<u64>,
    weight_threshold: u64,
}

#[event]
pub struct UnstakeRequest {
    from: Pubkey,
    script_pubkey: Vec<u8>,
    amount: u64,
}

#[event]
pub struct MintProofConsumed {
    recipient: Pubkey,
    payload_hash: [u8; 32],
    payload: Vec<u8>,
}
