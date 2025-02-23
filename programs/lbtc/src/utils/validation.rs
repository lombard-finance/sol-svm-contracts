use super::decoder;
use crate::{
    constants,
    errors::LBTCError,
    events::MintProofConsumed,
    state::{Config, Used},
};
use anchor_lang::prelude::*;
use anchor_spl::token_interface::{self, TokenAccount, TokenInterface};
use solana_ed25519_verify::verify_signature;
use solana_program::hash::Hash;

pub fn validate_mint(
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

pub fn validate_fee<'info>(
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

pub fn validate_valset(
    validators: &[[u8; 64]],
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
