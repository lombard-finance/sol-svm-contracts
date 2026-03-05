use anchor_lang::prelude::{require, Result as AnchorResult};
use std::io::{prelude::*, BufReader};

use crate::{
    constants::{MAX_VALIDATOR_SET_SIZE, MIN_VALIDATOR_SET_SIZE, VALIDATOR_PUBKEY_SIZE},
    errors::ConsortiumError,
};

pub const PAYLOAD_SELECTOR_LENGTH: usize = 4;
pub const UPDATE_VALSET_SELECTOR: [u8; PAYLOAD_SELECTOR_LENGTH] = [0x4a, 0xab, 0x1d, 0x6f];

pub struct UpdateValSetPayload {
    pub epoch: u64,
    pub validators: Vec<[u8; 64]>,
    pub weights: Vec<u64>,
    pub weight_threshold: u64,
    pub height: u64,
}

impl UpdateValSetPayload {
    /// Decodes an update valset payload from the given session payload bytes.
    ///
    /// # Arguments
    ///
    /// * `payload` - A byte slice containing the session payload.
    ///
    /// # Returns
    ///
    /// * `Ok(UpdateValSetPayload)` if the payload is a valid update valset payload.
    /// * `Err(LBTCError)` if the payload is not a valid update valset payload.
    pub fn from_session_payload(payload: &[u8]) -> Result<Self, ConsortiumError> {
        let mut reader = BufReader::new(payload);

        // check length is at least for all static fields and length of dynamic fields
        // 32 for the tuple length and 32 for each field
        // plus 4 for the consortium selector
        if payload.len() < 4 + 32 * 6 {
            return Err(ConsortiumError::InvalidPayloadLength);
        }

        // check selector
        let mut selector_bytes = [0u8; PAYLOAD_SELECTOR_LENGTH];
        reader.read_exact(&mut selector_bytes)?;
        if selector_bytes != UPDATE_VALSET_SELECTOR {
            return Err(ConsortiumError::WrongPayloadSelector);
        }

        // this is the abi encoding of the tuple (uint256, bytes[], uint256[], uint256, uint256)
        // so we need to read the first 32 bytes for the epoch
        // then the next 32 bytes for the offset to the validators
        // then the next 32 bytes for the offset to the weights
        // then the next 32 bytes for the weight_threshold
        // then the next 32 bytes for the height
        // Since we are reading everything and know sequence of types, we will skip all offsets and use
        // lengths to move reader to correct positions

        // Read epoch
        let mut epoch_bytes = [0u8; 32];
        reader.read_exact(&mut epoch_bytes)?;
        let epoch = u64::from_be_bytes(epoch_bytes[24..32].try_into().unwrap());

        // Skip validators_offset
        reader.consume(32);

        // Skip weights_offset
        reader.consume(32);

        // Read weight_threshold
        let mut weight_threshold_bytes = [0u8; 32];
        reader.read_exact(&mut weight_threshold_bytes)?;
        let weight_threshold =
            u64::from_be_bytes(weight_threshold_bytes[24..32].try_into().unwrap());

        // Read height
        let mut height_bytes = [0u8; 32];
        reader.read_exact(&mut height_bytes)?;
        let height = u64::from_be_bytes(height_bytes[24..32].try_into().unwrap());

        // Read validators length
        let mut validators_length_bytes = [0u8; 32];
        reader.read_exact(&mut validators_length_bytes)?;
        let validators_length =
            u64::from_be_bytes(validators_length_bytes[24..32].try_into().unwrap());

        // Skip offsets for validators bytes fields
        reader.consume(32 * validators_length as usize);
        let mut pubkey_field_length = [0u8; 32];
        let mut validators = Vec::new();
        for _ in 0..validators_length {
            reader.read_exact(&mut pubkey_field_length)?;
            let pubkey_field_length =
                u64::from_be_bytes(pubkey_field_length[24..32].try_into().unwrap());
            // +1 because pk for secp256k1 has a leading byte representing the format
            if pubkey_field_length as usize != VALIDATOR_PUBKEY_SIZE + 1 {
                return Err(ConsortiumError::InvalidValidatorPubkeyLength);
            }
            // skip secp256k1 length prefix (0x2, 0x3 for compressed, 0x4 for uncompressed)
            reader.consume(1);

            let mut validator_bytes = [0u8; VALIDATOR_PUBKEY_SIZE];
            reader.read_exact(&mut validator_bytes)?;
            validators.push(validator_bytes);

            // abi encodes in 32 byte slots, but since secp256k1 pubkey can be either 33 or 65 bytes,
            // there is always 1 spare byte encoded in a subsequent slot, so we consume the remaining
            // 31 bytes.
            reader.consume(31);
        }

        // Read weights length
        let mut weights_length_bytes = [0u8; 32];
        reader.read_exact(&mut weights_length_bytes)?;
        let weights_length = u64::from_be_bytes(weights_length_bytes[24..32].try_into().unwrap());

        if weights_length != validators_length {
            return Err(ConsortiumError::ValidatorsAndWeightsMismatch);
        }

        let mut weights = Vec::new();
        // can reuse same buffer since we decode and add to vec u64 instances
        let mut weight_bytes = [0u8; 32];
        for _ in 0..weights_length {
            reader.read_exact(&mut weight_bytes)?;
            weights.push(u64::from_be_bytes(weight_bytes[24..32].try_into().unwrap()));
        }

        if !reader.buffer().is_empty() {
            return Err(ConsortiumError::LeftoverData);
        }

        Ok(UpdateValSetPayload {
            epoch,
            validators,
            weights,
            weight_threshold,
            height,
        })
    }

    /// Validates the validator set payload.
    ///
    /// # Returns
    ///
    /// * `Ok(())` if the validator set payload is valid.
    /// * `Err(LBTCError)` if the validator set payload is not valid.
    pub fn validate_valset(&self) -> AnchorResult<()> {
        require!(
            self.validators.len() >= MIN_VALIDATOR_SET_SIZE,
            ConsortiumError::ValidatorSetSizeTooSmall
        );
        require!(
            self.validators.len() <= MAX_VALIDATOR_SET_SIZE,
            ConsortiumError::ValidatorSetSizeTooBig
        );
        require!(
            self.weight_threshold > 0,
            ConsortiumError::InvalidWeightThreshold
        );
        require!(
            self.validators.len() == self.weights.len(),
            ConsortiumError::ValidatorsAndWeightsMismatch
        );

        let mut sum = 0;
        for weight in &self.weights {
            require!(*weight > 0, ConsortiumError::ZeroWeight);
            sum += weight;
        }

        require!(
            sum >= self.weight_threshold,
            ConsortiumError::WeightsBelowThreshold
        );
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_abi_decode_success() {
        // Test data from the provided hex string
        let hex_data = "4aab1d6f000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000a00000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000004000000000000000000000000000000000000000000000000000000000000000c0000000000000000000000000000000000000000000000000000000000000004104ba5734d8f7091719471e7f7ed6b9df170dc70cc661ca05e688601ad984f068b0d67351e5f06073092499336ab0839ef8a521afd334e53807205fa2f08eec74f4000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000041049d9031e97dd78ff8c15aa86939de9b1e791066a0224e331bc962a2099a7b1f0464b8bbafe1535f2301c72c2cb3535b172da30b02686ab0393d348614f157fbdb00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000001";

        // Convert hex string to bytes
        let payload = hex::decode(hex_data).expect("Failed to decode hex string");

        // Test that abi_decode doesn't return an error, and print the error if it fails
        let result = UpdateValSetPayload::from_session_payload(&payload);
        if let Err(ref e) = result {
            eprintln!("abi_decode failed with error: {:?}", e);
        }
        assert!(result.is_ok(), "abi_decode should succeed without error");

        // Verify the decoded values
        let decoded = result.unwrap();
        assert_eq!(decoded.epoch, 1, "Epoch should be 1");
        assert_eq!(decoded.validators.len(), 2, "Should have 2 validators");
        assert_eq!(decoded.weights.len(), 2, "Should have 2 weights");
        assert_eq!(decoded.weight_threshold, 1, "Weight threshold should be 1");
        assert_eq!(decoded.height, 1, "Height should be 1");

        // Verify validator data structure
        for validator in &decoded.validators {
            assert_eq!(validator.len(), 64, "Each validator should be 64 bytes");
        }

        // Verify weights
        for weight in &decoded.weights {
            assert_eq!(*weight, 1, "Each weight should be 1");
        }
    }
}
