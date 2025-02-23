//! Implements the Lombard Finance protocol on Solana.
mod bitcoin_utils;
mod consortium;
pub(crate) mod constants;
mod decoder;
pub(crate) mod errors;
mod events;
pub mod instructions;

use anchor_lang::prelude::*;
use anchor_spl::token_interface::{self, TokenAccount, TokenInterface};
use decoder::ValsetAction;
use errors::LBTCError;
use events::*;
use solana_ed25519_verify::verify_signature;
use solana_program::{clock::Clock, hash::Hash};

declare_id!("5WFmz89q5RzSezsDQNCWoCJTEdYgne5u26kJPCyWvCEx");

#[program]
pub mod lbtc {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>, admin: Pubkey) -> Result<()> {
        ctx.accounts.config.admin = admin;
        Ok(())
    }

    pub fn post_mint_payload(
        ctx: Context<CfgMintPayload>,
        mint_payload_hash: [u8; 32],
        mint_payload: Vec<u8>,
    ) -> Result<()> {
        ctx.accounts.payload.payload = mint_payload.clone();
        emit!(MintPayloadPosted {
            hash: mint_payload_hash,
            payload: mint_payload,
        });
        Ok(())
    }

    pub fn post_signatures_for_mint_payload(
        ctx: Context<CfgMintPayload>,
        mint_payload_hash: [u8; 32],
        signatures: Vec<([u8; 64], usize)>,
    ) -> Result<()> {
        signatures.iter().for_each(|(signature, index)| {
            if !ctx
                .accounts
                .payload
                .signatures
                .iter()
                .any(|sig| sig == signature)
                && consortium::check_signature(
                    &ctx.accounts.config.validators,
                    signature,
                    &mint_payload_hash,
                    *index,
                )
            {
                ctx.accounts.payload.signatures.push(*signature);
                ctx.accounts.payload.weight += ctx.accounts.config.weights[*index];
            }
        });
        emit!(SignaturesAdded {
            hash: mint_payload_hash,
            signatures
        });
        Ok(())
    }

    pub fn mint_from_payload(
        ctx: Context<MintFromPayload>,
        mint_payload_hash: [u8; 32],
    ) -> Result<()> {
        require!(!ctx.accounts.config.paused, LBTCError::Paused);
        let amount = validate_mint(
            &ctx.accounts.config,
            &ctx.accounts.recipient,
            &mut ctx.accounts.used,
            &ctx.accounts.payload.payload,
            ctx.accounts.payload.weight,
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
            &ctx.accounts.payload.payload,
            ctx.accounts.payload.weight,
            mint_payload_hash,
        )?;

        let fee = validate_fee(
            &ctx.accounts.config,
            *ctx.program_id,
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

    pub fn set_initial_valset(ctx: Context<Valset>) -> Result<()> {
        validate_valset(
            &ctx.accounts.metadata.validators,
            &ctx.accounts.metadata.weights,
            ctx.accounts.payload.weight_threshold,
        )?;
        require!(
            ctx.accounts.config.epoch == 0,
            LBTCError::ValidatorSetAlreadySet
        );
        require!(ctx.accounts.payload.epoch != 0, LBTCError::InvalidEpoch);

        ctx.accounts.config.epoch = ctx.accounts.payload.epoch;
        ctx.accounts.config.validators = ctx.accounts.metadata.validators.clone();
        ctx.accounts.config.weights = ctx.accounts.metadata.weights.clone();
        ctx.accounts.config.weight_threshold = ctx.accounts.payload.weight_threshold;
        emit!(ValidatorSetUpdated {
            epoch: ctx.accounts.config.epoch,
            validators: ctx.accounts.config.validators.clone(),
            weights: ctx.accounts.config.weights.clone(),
            weight_threshold: ctx.accounts.config.weight_threshold,
        });
        Ok(())
    }

    pub fn set_next_valset(ctx: Context<Valset>) -> Result<()> {
        validate_valset(
            &ctx.accounts.metadata.validators,
            &ctx.accounts.metadata.weights,
            ctx.accounts.payload.weight_threshold,
        )?;
        require!(
            ctx.accounts.payload.weight >= ctx.accounts.config.weight_threshold,
            LBTCError::WeightsBelowThreshold
        );
        require!(ctx.accounts.config.epoch != 0, LBTCError::NoValidatorSet);
        require!(
            ctx.accounts.payload.epoch == ctx.accounts.config.epoch + 1,
            LBTCError::InvalidEpoch
        );
        require!(
            ctx.accounts.payload.weight >= ctx.accounts.config.weight_threshold,
            LBTCError::WeightsBelowThreshold
        );

        ctx.accounts.config.epoch = ctx.accounts.payload.epoch;
        ctx.accounts.config.validators = ctx.accounts.metadata.validators.clone();
        ctx.accounts.config.weights = ctx.accounts.metadata.weights.clone();
        ctx.accounts.config.weight_threshold = ctx.accounts.payload.weight_threshold;
        emit!(ValidatorSetUpdated {
            epoch: ctx.accounts.config.epoch,
            validators: ctx.accounts.config.validators.clone(),
            weights: ctx.accounts.config.weights.clone(),
            weight_threshold: ctx.accounts.config.weight_threshold,
        });
        Ok(())
    }

    pub fn post_metadata_for_valset_payload(
        ctx: Context<ValsetMetadata>,
        hash: [u8; 32],
        validators: Vec<[u8; 64]>,
        weights: Vec<u64>,
    ) -> Result<()> {
        ctx.accounts.metadata.validators.extend(validators.clone());
        ctx.accounts.metadata.weights.extend(weights.clone());
        emit!(ValsetMetadataPosted {
            hash,
            validators,
            weights
        });
        Ok(())
    }

    pub fn create_valset_payload(
        ctx: Context<CreateValset>,
        hash: [u8; 32],
        epoch: u64,
        weight_threshold: u64,
        height: u64,
    ) -> Result<()> {
        let payload = ValsetAction {
            action: constants::NEW_VALSET_ACTION,
            epoch,
            validators: ctx.accounts.metadata.validators,
            weights: ctx.accounts.metadata.weights,
            weight_threshold,
            height,
        };
        let bytes = payload.abi_encode();
        let bytes_hash = Hash::new(&bytes).to_bytes();
        require!(bytes_hash == hash, LBTCError::ValsetPayloadHashMismatch);
        ctx.accounts.payload.epoch = epoch;
        ctx.accounts.payload.weight_threshold = weight_threshold;
        ctx.accounts.payload.payload = bytes;
        emit!(ValsetPayloadCreated {
            hash,
            epoch,
            weight_threshold,
            height,
            payload: bytes
        });
        Ok(())
    }

    pub fn post_signatures_for_valset_payload(
        ctx: Context<AddSignature>,
        hash: [u8; 32],
        signatures: Vec<([u8; 64], usize)>,
    ) -> Result<()> {
        signatures.iter().for_each(|(signature, index)| {
            if !ctx
                .accounts
                .payload
                .signatures
                .iter()
                .any(|sig| sig == signature)
                && consortium::check_signature(
                    &ctx.accounts.config.validators,
                    signature,
                    &hash,
                    *index,
                )
            {
                ctx.accounts.payload.signatures.push(*signature);
                ctx.accounts.payload.weight += ctx.accounts.config.weights[*index];
            }
        });
        emit!(SignaturesAdded { hash, signatures });
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

    pub fn set_dust_fee_rate(ctx: Context<Admin>, rate: u64) -> Result<()> {
        ctx.accounts.config.dust_fee_rate = rate;
        emit!(DustFeeRateSet { rate });
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
    mint_payload: &[u8],
    weight: u64,
    mint_payload_hash: [u8; 32],
) -> Result<u64> {
    let mint_action = decoder::decode_mint_action(&mint_payload)?;
    if mint_action.recipient != recipient.key() {
        return err!(LBTCError::RecipientMismatch);
    }

    require!(
        mint_action.action == constants::DEPOSIT_BTC_ACTION,
        LBTCError::InvalidActionBytes
    );
    require!(
        mint_action.to_chain == constants::CHAIN_ID,
        LBTCError::InvalidChainID
    );

    let payload_hash = Hash::new(&mint_payload).to_bytes();
    if payload_hash != mint_payload_hash {
        return err!(LBTCError::MintPayloadHashMismatch);
    }

    require!(
        weight >= config.weight_threshold,
        LBTCError::WeightsBelowThreshold
    );

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
        payload: mint_payload.to_vec(),
    });
    Ok(mint_action.amount)
}

fn validate_fee<'info>(
    config: &Account<'info, Config>,
    program_id: Pubkey,
    recipient: &AccountInfo<'info>,
    fee_payload: Vec<u8>,
    fee_signature: [u8; 64],
) -> Result<u64> {
    let fee_action = decoder::decode_fee_action(&fee_payload)?;
    require!(
        fee_action.action == constants::FEE_APPROVAL_ACTION,
        LBTCError::InvalidActionBytes
    );

    require!(
        fee_action.chain_id == constants::CHAIN_ID,
        LBTCError::InvalidChainID
    );
    require!(
        fee_action.verifying_contract == program_id,
        LBTCError::InvalidVerifyingcontract
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

fn validate_valset(validators: &[[u8; 64]], weights: &[u64], weight_threshold: u64) -> Result<()> {
    require!(
        validators.len() >= constants::MIN_VALIDATOR_SET_SIZE,
        LBTCError::InvalidValidatorSetSize
    );
    require!(
        validators.len() <= constants::MAX_VALIDATOR_SET_SIZE,
        LBTCError::InvalidValidatorSetSize
    );
    require!(weight_threshold > 0, LBTCError::InvalidWeightThreshold);
    require!(
        validators.len() == weights.len(),
        LBTCError::ValidatorsAndWeightsMismatch
    );

    let mut sum = 0;
    for weight in weights {
        require!(*weight > 0, LBTCError::ZeroWeight);
        sum += weight;
    }

    require!(sum >= weight_threshold, LBTCError::WeightsBelowThreshold);
    Ok(())
}

fn execute_mint<'info>(
    token_program: AccountInfo<'info>,
    to: AccountInfo<'info>,
    amount: u64,
    mint: AccountInfo<'info>,
    authority: AccountInfo<'info>,
    token_authority_bump: u8,
) -> Result<()> {
    let token_authority_sig: &[&[&[u8]]] =
        &[&[constants::TOKEN_AUTHORITY_SEED, &[token_authority_bump]]];
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
    let token_authority_sig: &[&[&[u8]]] =
        &[&[constants::TOKEN_AUTHORITY_SEED, &[token_authority_bump]]];
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
pub struct CfgMintPayload<'info> {
    pub config: Account<'info, Config>,
    #[account(mut, seeds = [&mint_payload_hash], bump)]
    pub payload: Account<'info, MintPayload>,
}

#[derive(Accounts)]
#[instruction(mint_payload_hash: Vec<u8>)]
pub struct MintFromPayload<'info> {
    pub config: Account<'info, Config>,
    pub token_program: Interface<'info, TokenInterface>,
    pub recipient: InterfaceAccount<'info, TokenAccount>,
    pub token_mint: InterfaceAccount<'info, TokenAccount>,
    #[account(
        seeds = [constants::TOKEN_AUTHORITY_SEED],
        bump,
    )]
    pub token_authority: InterfaceAccount<'info, TokenAccount>,
    #[account(mut, seeds = [&mint_payload_hash], bump)]
    pub used: Account<'info, Used>,
    #[account(mut, close = recipient, seeds = [&mint_payload_hash], bump)]
    pub payload: Account<'info, MintPayload>,
    /// CHECK: This can be left empty in case of bascule being disabled, so we forego the check
    /// here.
    pub bascule: UncheckedAccount<'info>,
}

#[derive(Accounts)]
pub struct Mint<'info> {
    pub payer: Signer<'info>,
    pub config: Account<'info, Config>,
    pub token_program: Interface<'info, TokenInterface>,
    pub recipient: InterfaceAccount<'info, TokenAccount>,
    pub token_mint: InterfaceAccount<'info, TokenAccount>,
    #[account(
        seeds = [constants::TOKEN_AUTHORITY_SEED],
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
        seeds = [constants::TOKEN_AUTHORITY_SEED],
        bump,
    )]
    pub token_authority: InterfaceAccount<'info, TokenAccount>,
    pub treasury: InterfaceAccount<'info, TokenAccount>,
    #[account(mut, seeds = [&mint_payload_hash], bump)]
    pub used: Account<'info, Used>,
    #[account(mut, close = recipient, seeds = [&mint_payload_hash], bump)]
    pub payload: Account<'info, MintPayload>,
    /// CHECK: This can be left empty in case of bascule being disabled, so we forego the check
    /// here.
    pub bascule: UncheckedAccount<'info>,
}

#[derive(Accounts)]
pub struct Redeem<'info> {
    pub payer: Signer<'info>,
    pub config: Account<'info, Config>,
    pub token_program: Interface<'info, TokenInterface>,
    pub token_mint: InterfaceAccount<'info, TokenAccount>,
    #[account(
        seeds = [constants::TOKEN_AUTHORITY_SEED],
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

#[derive(Accounts)]
#[instruction(hash: Vec<u8>)]
pub struct AddSignature<'info> {
    pub payer: Signer<'info>,
    #[account(mut)]
    pub config: Account<'info, Config>,
    #[account(mut, seeds = [&hash, &payer.key.to_bytes()], bump)]
    pub payload: Account<'info, ValsetPayload>,
}

#[derive(Accounts)]
#[instruction(hash: Vec<u8>)]
pub struct Valset<'info> {
    pub payer: Signer<'info>,
    #[account(mut)]
    pub config: Account<'info, Config>,
    #[account(mut, close = payer, seeds = [&hash, b"metadata", &payer.key.to_bytes()], bump)]
    pub metadata: Account<'info, Metadata>,
    #[account(mut, close = payer, seeds = [&hash, &payer.key.to_bytes()], bump)]
    pub payload: Account<'info, ValsetPayload>,
}

#[derive(Accounts)]
#[instruction(hash: Vec<u8>)]
pub struct ValsetMetadata<'info> {
    pub payer: Signer<'info>,
    pub config: Account<'info, Config>,
    #[account(mut, seeds = [&hash, b"metadata", &payer.key.to_bytes()], bump)]
    pub metadata: Account<'info, Metadata>,
}

#[derive(Accounts)]
#[instruction(hash: Vec<u8>)]
pub struct CreateValset<'info> {
    pub payer: Signer<'info>,
    pub config: Account<'info, Config>,
    #[account(mut, seeds = [&hash, b"metadata", &payer.key.to_bytes()], bump)]
    pub metadata: Account<'info, Metadata>,
    #[account(mut, seeds = [&hash, &payer.key.to_bytes()], bump)]
    pub payload: Account<'info, ValsetPayload>,
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

    // Mint/redeem fields
    pub burn_commission: u64,
    pub withdrawals_enabled: bool,
    pub dust_fee_rate: u64,
    pub bascule_enabled: bool,

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

#[account]
pub struct MintPayload {
    payload: Vec<u8>,
    signatures: Vec<[u8; 64]>,
    weight: u64,
}

#[account]
pub struct Metadata {
    validators: Vec<[u8; 64]>,
    weights: Vec<u64>,
}

#[account]
pub struct ValsetPayload {
    epoch: u64,
    weight_threshold: u64,
    payload: Vec<u8>,
    signatures: Vec<[u8; 64]>,
    weight: u64,
}
