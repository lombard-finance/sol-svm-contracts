use crate::{errors::LBTCError, Config};
use anchor_lang::prelude::*;
use std::io::{prelude::*, BufReader};

pub struct MintAction {
    pub to_chain: [u8; 32],
    pub recipient: Pubkey,
    pub amount: u64,
    pub txid: [u8; 32],
    pub vout: u32,
}

pub struct ValsetAction {
    pub epoch: u64,
    pub validators: Vec<[u8; 64]>,
    pub weights: Vec<u64>,
    pub weight_threshold: u64,
    pub height: u64,
}

pub struct FeeAction {
    pub fee: u64,
    pub expiry: u64,
}

pub fn decode_mint_action(config: &Account<'_, Config>, bytes: &[u8]) -> Result<MintAction> {
    let mut reader = BufReader::new(bytes);

    // Check action bytes
    let mut action_bytes = [0u8; 4];
    reader.read_exact(&mut action_bytes)?;
    let action = u32::from_be_bytes(action_bytes);
    require!(
        action == config.deposit_btc_action,
        LBTCError::InvalidActionBytes
    );

    // Read to_chain
    let mut to_chain = [0u8; 32];
    reader.read_exact(&mut to_chain)?;
    require!(to_chain == config.chain_id, LBTCError::InvalidChainID);

    // Read recipient
    let mut recipient_bytes = [0u8; 32];
    reader.read_exact(&mut recipient_bytes)?;
    let recipient = Pubkey::from(recipient_bytes);

    // Read amount
    let mut amount_bytes = [0u8; 32];
    reader.read_exact(&mut amount_bytes)?;

    // Remove padding, as ethereum left-pads encoded uint256. Then we convert to u64.
    // The amount is encoded as big-endian, and we assume to never exceed u64::MAX,
    // given that the maximum value of LBTC is 2_100_000_000_000_000, and u64::MAX
    // is defined as 18_446_744_073_709_551_615, so this should always fit.
    // Thus, we decode the leftover bytes as a big-endian u64.
    let amount = convert_to_u64_be(amount_bytes)?;

    // Read txid
    let mut txid = [0u8; 32];
    reader.read_exact(&mut txid)?;

    // Read vout
    let mut vout_bytes = [0u8; 32];
    reader.read_exact(&mut vout_bytes)?;
    let vout = convert_to_u32_be(vout_bytes)?;

    // Ensure buffer is now empty, to avoid collisions with deposits made previously.
    let mut leftover = vec![];
    reader.read_to_end(&mut leftover)?;
    if leftover.len() > 0 {
        err!(LBTCError::LeftoverData)
    } else {
        Ok(MintAction {
            to_chain,
            recipient,
            amount,
            txid,
            vout,
        })
    }
}

pub fn decode_valset_action(config: &Account<'_, Config>, bytes: &[u8]) -> Result<ValsetAction> {
    let mut reader = BufReader::new(bytes);

    // Check action bytes
    let mut action_bytes = [0u8; 4];
    reader.read_exact(&mut action_bytes)?;
    let action = u32::from_be_bytes(action_bytes);
    require!(
        action == config.set_valset_action,
        LBTCError::InvalidActionBytes
    );

    // Read epoch
    let mut epoch_bytes = [0u8; 32];
    reader.read_exact(&mut epoch_bytes)?;
    let epoch = convert_to_u64_be(epoch_bytes)?;

    // Read validators
    let mut validators = vec![];
    // Read length
    let mut validators_length_bytes = [0u8; 32];
    reader.read_exact(&mut validators_length_bytes)?;
    let validators_length = convert_to_u64_be(validators_length_bytes)?;

    // Read offset
    // We can chop these bytes off minus the initial 32 to immediately arrive at the first element
    // in the array.
    let mut validators_offset_bytes = [0u8; 32];
    reader.read_exact(&mut validators_offset_bytes)?;
    let validators_offset = convert_to_u64_be(validators_offset_bytes)?;

    // Consume what we just read from the offset.
    let to_consume = validators_offset - 32;
    for _ in 0..to_consume {
        let mut byte = [0u8; 1];
        reader.read_exact(&mut byte)?;
    }

    for _ in 0..validators_length {
        let mut validator_length_bytes = [0u8; 32];
        reader.read_exact(&mut validator_length_bytes)?;
        let validator_length = convert_to_u64_be(validator_length_bytes)?;
        assert!(validator_length == 65);

        // Chop off identifier byte; we don't need it for our purposes.
        let mut identifier_byte = [0u8; 1];
        reader.read_exact(&mut identifier_byte)?;

        // Read public key
        let mut validator = [0u8; 64];
        reader.read_exact(&mut validator)?;
        validators.push(validator);

        // Since ethereum encodes in 32 byte slots, we are now at a 31 byte offset, so we can read
        // and discard the next 31 bytes.
        let mut discarded_bytes = [0u8; 31];
        reader.read_exact(&mut discarded_bytes)?
    }

    let mut weights = vec![];
    let mut weights_length_bytes = [0u8; 32];
    reader.read_exact(&mut weights_length_bytes)?;
    let weights_length = convert_to_u64_be(weights_length_bytes)?;
    for _ in 0..weights_length {
        let mut weight_bytes = [0u8; 32];
        reader.read_exact(&mut weight_bytes)?;
        let weight = convert_to_u64_be(weight_bytes)?;
        weights.push(weight);
    }

    // Read weight threshold
    let mut weight_threshold_bytes = [0u8; 32];
    reader.read_exact(&mut weight_threshold_bytes)?;
    let weight_threshold = convert_to_u64_be(weight_threshold_bytes)?;

    // Read height
    let mut height_bytes = [0u8; 32];
    reader.read_exact(&mut height_bytes)?;
    let height = convert_to_u64_be(height_bytes)?;

    // Ensure buffer is now empty, to avoid collisions with valsets set previously.
    let mut leftover = vec![];
    reader.read_to_end(&mut leftover)?;
    if leftover.len() > 0 {
        err!(LBTCError::LeftoverData)
    } else {
        Ok(ValsetAction {
            epoch,
            validators,
            weights,
            weight_threshold,
            height,
        })
    }
}

pub fn decode_signatures(bytes: &[u8]) -> Result<Vec<[u8; 64]>> {
    let mut signatures = vec![];
    let mut reader = BufReader::new(bytes);

    // Decode an initial offset, which can be discarded.
    let mut initial_offset = [0u8; 32];
    reader.read_exact(&mut initial_offset)?;

    // Read length
    let mut length_bytes = [0u8; 32];
    reader.read_exact(&mut length_bytes)?;
    let length = convert_to_u64_be(length_bytes)?;

    // Read offset
    // We can chop these bytes off minus the initial 32 to immediately arrive at the first element
    // in the array.
    let mut offset_bytes = [0u8; 32];
    reader.read_exact(&mut offset_bytes)?;
    let offset = convert_to_u64_be(offset_bytes)?;

    // Consume what we just read from the offset.
    let to_consume = offset - 32;
    for _ in 0..to_consume {
        let mut byte = [0u8; 1];
        reader.read_exact(&mut byte)?;
    }

    // Now, proceed to decode signatures.
    for _ in 0..length {
        let mut signature_length_bytes = [0u8; 32];
        reader.read_exact(&mut signature_length_bytes)?;
        let signature_length = convert_to_u64_be(signature_length_bytes)?;
        assert!(signature_length == 64);

        let mut signature = [0u8; 64];
        reader.read_exact(&mut signature)?;
        signatures.push(signature);
    }

    // Ensure buffer is now empty, to avoid collisions with valsets set previously.
    let mut leftover = vec![];
    reader.read_to_end(&mut leftover)?;
    if leftover.len() > 0 {
        err!(LBTCError::LeftoverData)
    } else {
        Ok(signatures)
    }
}

pub fn decode_fee_payload(config: &Account<'_, Config>, bytes: &[u8]) -> Result<FeeAction> {
    let mut reader = BufReader::new(bytes);

    // Check action bytes
    let mut action_bytes = [0u8; 4];
    reader.read_exact(&mut action_bytes)?;
    let action = u32::from_be_bytes(action_bytes);
    require!(
        action == config.fee_approval_action,
        LBTCError::InvalidActionBytes
    );

    // Read fee
    let mut fee_bytes = [0u8; 32];
    reader.read_exact(&mut fee_bytes)?;
    let fee = convert_to_u64_be(fee_bytes)?;

    // Read expiry
    let mut expiry_bytes = [0u8; 32];
    reader.read_exact(&mut expiry_bytes)?;
    let expiry = convert_to_u64_be(expiry_bytes)?;

    // Ensure buffer is now empty.
    let mut leftover = vec![];
    reader.read_to_end(&mut leftover)?;
    if leftover.len() > 0 {
        err!(LBTCError::LeftoverData)
    } else {
        Ok(FeeAction { fee, expiry })
    }
}

// Removes left-padded bytes and interprets the value as a big endian u64.
fn convert_to_u64_be(bytes: [u8; 32]) -> Result<u64> {
    let mut result = remove_padding(bytes);

    require!(result.len() <= 8, LBTCError::U64TooLarge);

    // Insert bytes at the start until we hit 8 bytes in length (big-endian padding).
    while result.len() < 8 {
        result.insert(0, 0);
    }

    Ok(u64::from_be_bytes(
        result
            .try_into()
            .map_err(|_| LBTCError::CouldNotConvertToU64)?,
    ))
}

fn convert_to_u32_be(bytes: [u8; 32]) -> Result<u32> {
    let mut result = remove_padding(bytes);

    require!(result.len() <= 4, LBTCError::U32TooLarge);

    // Insert bytes at the start until we hit 4 bytes in length (big-endian padding).
    while result.len() < 4 {
        result.insert(0, 0);
    }

    Ok(u32::from_be_bytes(
        result
            .try_into()
            .map_err(|_| LBTCError::CouldNotConvertToU32)?,
    ))
}

fn remove_padding(bytes: [u8; 32]) -> Vec<u8> {
    let mut result = vec![];
    let mut padding_removed = false;
    for byte in bytes {
        if !padding_removed && byte == 0 {
            continue;
        } else if !padding_removed && byte != 0 {
            padding_removed = true;
        }

        result.push(byte);
    }

    result
}
