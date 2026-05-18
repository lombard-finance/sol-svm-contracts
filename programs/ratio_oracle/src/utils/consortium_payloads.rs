use std::io::{prelude::*, BufReader};

use abi_utils::{u128_from_abi_word, u64_from_abi_word};
use crate::errors::RatioOracleError;

pub const RATIO_UPDATE_SELECTOR: [u8; 4] = [0x6c, 0x72, 0x2c, 0x2c];
pub const RATIO_UPDATE_PAYLOAD_LEN: usize = 4 + 32 * 3;

pub struct RatioUpdate {
    pub denom_hash: [u8; 32],
    pub ratio: u128,
    pub timestamp: u64,
}

impl RatioUpdate {
    /// creates a DepositV1 struct from an ethereum ABI-encoded DepositV1 payload
    pub fn from_session_payload(payload: &[u8]) -> Result<Self, RatioOracleError> {
        let mut reader = BufReader::new(payload);
        if payload.len() != RATIO_UPDATE_PAYLOAD_LEN {
            return Err(RatioOracleError::InvalidPayloadLength);
        }

        // Check action bytes
        let mut selector = [0u8; 4];
        reader.read_exact(&mut selector)?;
        if selector != RATIO_UPDATE_SELECTOR {
            return Err(RatioOracleError::InvalidPayloadSelector);
        }

        let mut ratio_update = Self {
            denom_hash: [0u8; 32],
            ratio: 0,
            timestamp: 0,
        };

        // Read denom hash
        reader.read_exact(&mut ratio_update.denom_hash)?;

        // Read ratio
        let mut ratio_bytes = [0u8; 32];
        reader.read_exact(&mut ratio_bytes)?;
        ratio_update.ratio = u128_from_abi_word(&ratio_bytes).ok_or(RatioOracleError::AbiWordOverflow)?;

        // Read timestamp
        let mut timestamp_bytes = [0u8; 32];
        reader.read_exact(&mut timestamp_bytes)?;
        ratio_update.timestamp = u64_from_abi_word(&timestamp_bytes).ok_or(RatioOracleError::AbiWordOverflow)?;

        Ok(ratio_update)
    }
}
