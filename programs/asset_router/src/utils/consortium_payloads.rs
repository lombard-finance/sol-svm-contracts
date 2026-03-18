use std::io::{prelude::*, BufReader};

use crate::errors::AssetRouterError;

pub const DEPOSIT_V1_SELECTOR: [u8; 4] = [0xce, 0x25, 0xe7, 0xc2];
pub const DEPOSIT_V1_PAYLOAD_LEN: usize = 4 + 32 * 6;

pub struct DepositV1 {
    pub destination_chain_id: [u8; 32],
    pub recipient: [u8; 32],
    pub amount: u64,
    pub txid: [u8; 32],
    pub vout: u32,
    pub token_address: [u8; 32],
}

impl DepositV1 {
    /// creates a DepositV1 struct from an ethereum ABI-encoded DepositV1 payload
    pub fn from_session_payload(payload: &[u8]) -> Result<Self, AssetRouterError> {
        let mut reader = BufReader::new(payload);
        if payload.len() != DEPOSIT_V1_PAYLOAD_LEN {
            return Err(AssetRouterError::InvalidPayloadLength);
        }

        // Check action bytes
        let mut selector = [0u8; 4];
        reader.read_exact(&mut selector)?;
        if selector != DEPOSIT_V1_SELECTOR {
            return Err(AssetRouterError::InvalidPayloadSelector);
        }

        let mut deposit_v1 = Self {
            destination_chain_id: [0u8; 32],
            recipient: [0u8; 32],
            amount: 0,
            txid: [0u8; 32],
            vout: 0,
            token_address: [0u8; 32],
        };

        // Read destination chain id
        reader.read_exact(&mut deposit_v1.destination_chain_id)?;

        // Read recipient
        reader.read_exact(&mut deposit_v1.recipient)?;

        // Read amount
        let mut amount_bytes = [0u8; 32];
        reader.read_exact(&mut amount_bytes)?;
        deposit_v1.amount = u64::from_be_bytes(amount_bytes[24..32].try_into().unwrap());

        // Read txid
        reader.read_exact(&mut deposit_v1.txid)?;
        // txid is encoded big-endian so it needs to be reversed.
        deposit_v1.txid = deposit_v1
            .txid
            .into_iter()
            .rev()
            .collect::<Vec<u8>>()
            .try_into()
            .expect("should be able to reverse and cast to array");

        // Read vout
        let mut vout_bytes = [0u8; 32];
        reader.read_exact(&mut vout_bytes)?;
        deposit_v1.vout = u32::from_be_bytes(vout_bytes[28..32].try_into().unwrap());

        // Read token address
        reader.read_exact(&mut deposit_v1.token_address)?;

        Ok(deposit_v1)
    }
}
