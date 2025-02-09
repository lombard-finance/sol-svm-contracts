use crate::errors::LBTCError;
use anchor_lang::prelude::*;
use std::io::{prelude::*, BufReader};

pub struct MintAction {
    pub action: u32,
    pub to_chain: [u8; 32],
    pub recipient: Pubkey,
    pub amount: u64,
    pub txid: [u8; 32],
    pub vout: u32,
}

pub struct ValsetAction {
    pub action: u32,
    pub epoch: u64,
    pub validators: Vec<[u8; 65]>,
    pub weights: Vec<u64>,
    pub weight_threshold: u64,
    pub height: u64,
}

pub struct FeeAction {
    pub action: u32,
    pub fee: u64,
    pub expiry: u64,
}

pub fn decode_mint_action(bytes: &[u8]) -> Result<MintAction> {
    let mut reader = BufReader::new(bytes);

    // Check action bytes
    let mut action_bytes = [0u8; 4];
    reader.read_exact(&mut action_bytes)?;
    let action = u32::from_be_bytes(action_bytes);

    // Read to_chain
    let mut to_chain = [0u8; 32];
    reader.read_exact(&mut to_chain)?;

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
    // txid is encoded big-endian so it needs to be reversed.
    txid = txid
        .into_iter()
        .rev()
        .collect::<Vec<u8>>()
        .try_into()
        .expect("should be able to reverse and cast to array");

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
            action,
            to_chain,
            recipient,
            amount,
            txid,
            vout,
        })
    }
}

pub fn decode_valset_action(bytes: &[u8]) -> Result<ValsetAction> {
    let mut reader = BufReader::new(bytes);

    // Check action bytes
    let mut action_bytes = [0u8; 4];
    reader.read_exact(&mut action_bytes)?;
    let action = u32::from_be_bytes(action_bytes);

    // Read epoch
    let mut epoch_bytes = [0u8; 32];
    reader.read_exact(&mut epoch_bytes)?;
    let epoch = convert_to_u64_be(epoch_bytes)?;

    // Chop off two offsets that we won't need
    let mut useless_offset = [0u8; 32];
    reader.read_exact(&mut useless_offset)?;
    reader.read_exact(&mut useless_offset)?;

    // Read weight threshold
    let mut weight_threshold_bytes = [0u8; 32];
    reader.read_exact(&mut weight_threshold_bytes)?;
    let weight_threshold = convert_to_u64_be(weight_threshold_bytes)?;

    // Read height
    let mut height_bytes = [0u8; 32];
    reader.read_exact(&mut height_bytes)?;
    let height = convert_to_u64_be(height_bytes)?;

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

        // Read public key
        let mut validator = [0u8; 65];
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

    // Ensure buffer is now empty, to avoid collisions with valsets set previously.
    let mut leftover = vec![];
    reader.read_to_end(&mut leftover)?;
    if leftover.len() > 0 {
        err!(LBTCError::LeftoverData)
    } else {
        Ok(ValsetAction {
            action,
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

pub fn decode_fee_action(bytes: &[u8]) -> Result<FeeAction> {
    let mut reader = BufReader::new(bytes);

    // Check action bytes
    let mut action_bytes = [0u8; 4];
    reader.read_exact(&mut action_bytes)?;
    let action = u32::from_be_bytes(action_bytes);

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
        Ok(FeeAction {
            action,
            fee,
            expiry,
        })
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

#[cfg(test)]
mod tests {
    use super::*;
    use hex;

    #[test]
    fn test_decode_mint_payload() {
        let mint_payload = hex::decode("f2e73f7c0000000000000000000000000000000000000000000000000000000000aa36a70000000000000000000000000f90793a54e809bf708bd0fbcc63d311e3bb1be100000000000000000000000000000000000000000000000000000000000059d85a7c1a028fe68c29a449a6d8c329b9bdd39d8b925ba0f8abbde9fe398430fac40000000000000000000000000000000000000000000000000000000000000000").unwrap();
        let mint_action = decode_mint_action(&mint_payload).unwrap();
        assert_eq!(mint_action.action, 4075241340);
        assert_eq!(
            mint_action.to_chain.to_vec(),
            hex::decode("0000000000000000000000000000000000000000000000000000000000aa36a7")
                .unwrap()
        );
        assert_eq!(
            hex::encode(mint_action.recipient),
            "0000000000000000000000000f90793a54e809bf708bd0fbcc63d311e3bb1be1"
        );
        assert_eq!(mint_action.amount, 23000);
        assert_eq!(
            hex::encode(mint_action.txid),
            "c4fa308439fee9bdabf8a05b928b9dd3bdb929c3d8a649a4298ce68f021a7c5a"
        );
        assert_eq!(mint_action.vout, 0);
    }

    #[test]
    fn test_decode_valset_payload() {
        let valset_payload = hex::decode("4aab1d6f000000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000a0000000000000000000000000000000000000000000000000000000000000034000000000000000000000000000000000000000000000000000000000000001400000000000000000000000000000000000000000000000000000000000000006000000000000000000000000000000000000000000000000000000000000000400000000000000000000000000000000000000000000000000000000000000800000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000018000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000041047378e006183e9a5de1537b788aa9d107c67189cd358efc1d53a5642dc0a373113e8808ff945b2e03470bc19d0d11284ed24fee8bbf2c90908b640a91931b257200000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000004104ca1bf4568f0e73ed993c9cb80bb46492101e0847000288d1cdc246ff67ecda20da20c13b7ed03a97c1c9667ebfdaf1933e1c731d496b62d82d0b8cb71b33bfd500000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000004104ac2fec1927f210f2056d13c9ba0706666f333ed821d2032672d71acf47677eae4c474ec4b2ee94be26655a1103ddbd0b97807a39b1551a8c52eeece8cc48829900000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000004104b56056d0cb993765f963aeb530f7687c44d875bd34e38edc719bb117227901c5823dc3a6511d67dc5d081ac2a9d41219168f060f80c672c0391009cd267e4eb40000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000040000000000000000000000000000000000000000000000000000000000000064000000000000000000000000000000000000000000000000000000000000006400000000000000000000000000000000000000000000000000000000000000640000000000000000000000000000000000000000000000000000000000000064").unwrap();
        let valset_action = decode_valset_action(&valset_payload).unwrap();
        assert_eq!(valset_action.action, 1252728175);
        assert_eq!(valset_action.epoch, 2);
        assert_eq!(valset_action.weight_threshold, 320);
        assert_eq!(valset_action.validators.len(), 4);
        assert_eq!(valset_action.weights.len(), 4);
        assert_eq!(valset_action.validators[0].to_vec(), hex::decode("047378e006183e9a5de1537b788aa9d107c67189cd358efc1d53a5642dc0a373113e8808ff945b2e03470bc19d0d11284ed24fee8bbf2c90908b640a91931b2572").unwrap());
        assert_eq!(valset_action.validators[1].to_vec(), hex::decode("04ca1bf4568f0e73ed993c9cb80bb46492101e0847000288d1cdc246ff67ecda20da20c13b7ed03a97c1c9667ebfdaf1933e1c731d496b62d82d0b8cb71b33bfd5").unwrap());
        assert_eq!(valset_action.validators[2].to_vec(), hex::decode("04ac2fec1927f210f2056d13c9ba0706666f333ed821d2032672d71acf47677eae4c474ec4b2ee94be26655a1103ddbd0b97807a39b1551a8c52eeece8cc488299").unwrap());
        assert_eq!(valset_action.validators[3].to_vec(), hex::decode("04b56056d0cb993765f963aeb530f7687c44d875bd34e38edc719bb117227901c5823dc3a6511d67dc5d081ac2a9d41219168f060f80c672c0391009cd267e4eb4").unwrap());

        for weight in valset_action.weights {
            assert_eq!(weight, 100);
        }
    }

    #[test]
    fn test_decode_signatures() {
        let signatures_payload = hex::decode("00000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000003000000000000000000000000000000000000000000000000000000000000006000000000000000000000000000000000000000000000000000000000000000c0000000000000000000000000000000000000000000000000000000000000012000000000000000000000000000000000000000000000000000000000000000405ac3b079f374485585c941449e67e4fd33217c4a5579dc61f9d7b2704a00820c29d588f2981f7a2a429cf2df97ed1ead40f37d1c4fc45257ee37592861b4957000000000000000000000000000000000000000000000000000000000000000404588a44b8309f6602515e4aa5e6868b4b8131bea1a3d7e137049113b31c2ea384a3cea2e1ce7ecdd30cf6caabd22282dc65324de0c14e857c4850c981935a0260000000000000000000000000000000000000000000000000000000000000040b31e60fd4802a7d476dc9a75b280182c718ffd8a0ddf4630b4a91b4450a2c3ca5f9f34229c2c9da7a86881fefe7f41ffcafd96b6157da2729f59c4856e2d437a").unwrap();
        let _signatures = decode_signatures(&signatures_payload).unwrap();
    }

    #[test]
    fn test_decode_fee_payload() {
        let fee_payload = hex::decode("8175ca940000000000000000000000000000000000000000000000000000000005f5e0ff00000000000000000000000000000000000000000000000000000000678621c7").unwrap();
        let fee_action = decode_fee_action(&fee_payload).unwrap();
        assert_eq!(fee_action.action, 2171980436);
        assert_eq!(fee_action.fee, 99999999);
        assert_eq!(fee_action.expiry, 1736843719);
    }
}
