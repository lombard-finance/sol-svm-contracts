use super::decoder;
use crate::{constants, errors::LBTCError, state::Config};
use anchor_lang::prelude::*;
use anchor_spl::token_interface::TokenAccount;
use bascule::{
    cpi::{accounts::Validator, validate_withdrawal},
    program::Bascule,
    state::{BasculeData, Deposit},
    to_deposit_id,
};
use solana_ed25519_verify::verify_signature;

pub fn pre_validate_mint<'info>(mint_payload: &[u8]) -> Result<()> {
    let mint_action = decoder::decode_mint_action(&mint_payload)?;
    require!(
        mint_action.action == constants::DEPOSIT_BTC_ACTION,
        LBTCError::InvalidActionBytes
    );
    require!(
        mint_action.to_chain == constants::CHAIN_ID,
        LBTCError::InvalidChainID
    );
    Ok(())
}

pub fn post_validate_mint<'info>(
    payer: &Signer<'info>,
    config: &Account<'info, Config>,
    config_bump: u8,
    recipient: &InterfaceAccount<'_, TokenAccount>,
    mint_payload: &[u8],
    weight: u64,
    bascule: &Option<Program<'info, Bascule>>,
    bascule_data: &Option<Account<'info, BasculeData>>,
    deposit: &Option<Account<'info, Deposit>>,
    system_program: &Option<Program<'info, System>>,
) -> Result<u64> {
    let mint_action = decoder::decode_mint_action(&mint_payload)?;
    require!(
        mint_action.recipient == recipient.key(),
        LBTCError::RecipientMismatch
    );

    require!(
        weight >= config.weight_threshold,
        LBTCError::NotEnoughSignatures
    );

    // We use the LBTC config as the signer.
    let signer_seeds: &[&[&[u8]]] = &[&[constants::CONFIG_SEED, &[config_bump]]];
    // Confirm deposit against bascule, if using.
    if config.bascule_enabled {
        validate_withdrawal(
            CpiContext::new_with_signer(
                bascule
                    .as_ref()
                    .expect("bascule should be passed if bascule is enabled")
                    .to_account_info(),
                Validator {
                    payer: payer.to_account_info(),
                    validator: config.to_account_info(),
                    bascule_data: bascule_data
                        .as_ref()
                        .expect("bascule data should be passed if bascule is enabled")
                        .to_account_info(),
                    deposit: deposit
                        .as_ref()
                        .expect("deposit should be passed if bascule is enabled")
                        .to_account_info(),
                    system_program: system_program.as_ref().expect("system program should be passed if bascule is enabled").to_account_info(),
                },
                signer_seeds,
            ),
            to_deposit_id(
                mint_action.recipient,
                mint_action.amount,
                mint_action.txid,
                mint_action.vout,
            ),
            mint_action.recipient,
            mint_action.amount,
            mint_action.txid,
            mint_action.vout,
        )?;
    }

    Ok(mint_action.amount)
}

pub fn validate_fee<'info>(
    config: &Account<'info, Config>,
    program_id: Pubkey,
    recipient_auth: &AccountInfo<'info>,
    fee_payload: [u8; constants::FEE_PAYLOAD_LEN],
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
    if verify_signature(&recipient_auth.key(), &fee_signature, &fee_payload)
        .map_err(|_| LBTCError::InvalidFeeSignature)?
    {
        Ok(fee)
    } else {
        err!(LBTCError::InvalidFeeSignature)
    }
}

pub fn validate_valset(
    validators: &[[u8; constants::VALIDATOR_PUBKEY_SIZE]],
    weights: &[u64],
    weight_threshold: u64,
) -> Result<()> {
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
