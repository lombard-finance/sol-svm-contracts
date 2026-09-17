use std::{cmp, io::{BufReader, prelude::*}};
use abi_utils::u64_from_abi_word;
use anchor_lang::prelude::{borsh, AnchorSerialize, AnchorDeserialize};

use crate::{constants::OPTIONAL_MESSAGE_SIZE, errors::BridgeError};

// The type of the ABI encoded message with fields:
// destination chain id, staking token address, sender, recipient, amount
// bytes4(keccak256("deposit(bytes32,bytes32,bytes32,bytes32,uint256)"))
pub const MSG_VERSION_MIN: u8 = 0x1;
pub const MSG_VERSION: u8 = 0x2;

pub const MINT_MESSAGE_MIN_LENGTH: usize = 129;

pub struct BridgeToken {
    pub destination_token_address: [u8; 32],
    pub sender: [u8; 32],
    pub recipient: [u8; 32],
    pub amount: u64,
    pub optional_message: Option<[u8; OPTIONAL_MESSAGE_SIZE]>,
}

impl BridgeToken {
    pub fn to_gmp_body(&self) -> Vec<u8> {
        let mut message = Vec::new();
        match self.optional_message {
            Some(_msg) => {
                message.resize(1,MSG_VERSION);
            }
            None => {
                message.resize(1,MSG_VERSION_MIN);
            }
        }        
        message.extend_from_slice(&self.destination_token_address);
        message.extend_from_slice(&self.sender);
        message.extend_from_slice(&self.recipient);
        let mut amount_bytes = [0u8; 32];
        amount_bytes[24..].copy_from_slice(&self.amount.to_be_bytes());
        message.extend_from_slice(&amount_bytes);
        match self.optional_message {
            Some(msg) => {
                message.extend_from_slice(&msg);
            }
            None => {
                // do nothing
            }
        }
        message
    }
}

pub struct Mint {
    pub token_address: [u8; 32],
    pub sender: [u8; 32],
    pub recipient: [u8; 32],
    pub amount: u64,
    pub message: Option<[u8; OPTIONAL_MESSAGE_SIZE]>,
}

impl Mint {
    pub fn from_message(message: &[u8]) -> Result<Self, BridgeError> {
        if message.len() < MINT_MESSAGE_MIN_LENGTH {
            return Err(BridgeError::InvalidMessageLength);
        }

        let mut reader = BufReader::new(message);

        let mut version_bytes = [0u8; 1];
        reader.read_exact(&mut version_bytes)?;
        let version = u8::from_be_bytes(version_bytes);
        if version < MSG_VERSION_MIN || version > MSG_VERSION || (version == MSG_VERSION_MIN && message.len() != MINT_MESSAGE_MIN_LENGTH) {
            return Err(BridgeError::InvalidMessageVersion);
        }

        let mut mint = Self {
            token_address: [0u8; 32],
            sender: [0u8; 32],
            recipient: [0u8; 32],
            amount: 0,
            message: None,
        };

        reader.read_exact(&mut mint.token_address)?;
        reader.read_exact(&mut mint.sender)?;
        reader.read_exact(&mut mint.recipient)?;

        let mut amount_bytes = [0u8; 32];
        reader.read_exact(&mut amount_bytes)?;
        mint.amount = u64_from_abi_word(&amount_bytes).ok_or(BridgeError::AbiWordOverflow)?;
        if message.len() > MINT_MESSAGE_MIN_LENGTH {
            let mut msg_bytes = [0u8; OPTIONAL_MESSAGE_SIZE];
            let remaining = cmp::min(message.len() - MINT_MESSAGE_MIN_LENGTH, OPTIONAL_MESSAGE_SIZE);
            msg_bytes[..remaining].copy_from_slice(&message[MINT_MESSAGE_MIN_LENGTH..MINT_MESSAGE_MIN_LENGTH+remaining]);
            mint.message =  Some(msg_bytes);            
        }

        Ok(mint)
    }
}

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct InboundResponse {
    pub amount: u64,
    pub message: Option<[u8; OPTIONAL_MESSAGE_SIZE]>,
}

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct OutboundResponse {
    pub nonce: u64,
    pub payload_hash: [u8; 32],
}

#[cfg(test)]
mod tests {
    use super::*;

    const TOKEN: [u8; 32] = [0x11; 32];
    const SENDER: [u8; 32] = [0x22; 32];
    const RECIPIENT: [u8; 32] = [0x33; 32];
    const AMOUNT: u64 = 1000;

    // version byte + token + sender + recipient + amount = MINT_MESSAGE_MIN_LENGTH bytes
    fn base_message(version: u8) -> Vec<u8> {
        let mut message = vec![version];
        message.extend_from_slice(&TOKEN);
        message.extend_from_slice(&SENDER);
        message.extend_from_slice(&RECIPIENT);
        let mut amount_bytes = [0u8; 32];
        amount_bytes[24..].copy_from_slice(&AMOUNT.to_be_bytes());
        message.extend_from_slice(&amount_bytes);
        assert_eq!(message.len(), MINT_MESSAGE_MIN_LENGTH);
        message
    }

    fn assert_fixed_fields(mint: &Mint) {
        assert_eq!(mint.token_address, TOKEN);
        assert_eq!(mint.sender, SENDER);
        assert_eq!(mint.recipient, RECIPIENT);
        assert_eq!(mint.amount, AMOUNT);
    }

    #[test]
    fn rejects_message_shorter_than_min_length() {
        let mut message = base_message(MSG_VERSION_MIN);
        message.pop();
        assert!(matches!(
            Mint::from_message(&message),
            Err(BridgeError::InvalidMessageLength)
        ));
    }

    #[test]
    fn parses_v1_without_optional_message() {
        let mint = Mint::from_message(&base_message(MSG_VERSION_MIN)).unwrap();
        assert_fixed_fields(&mint);
        assert!(mint.message.is_none());
    }

    #[test]
    fn rejects_v1_with_trailing_bytes() {
        let mut message = base_message(MSG_VERSION_MIN);
        message.push(0xAB);
        assert!(matches!(
            Mint::from_message(&message),
            Err(BridgeError::InvalidMessageVersion)
        ));
    }

    #[test]
    fn rejects_unknown_versions() {
        for version in [0x0, MSG_VERSION + 1] {
            assert!(matches!(
                Mint::from_message(&base_message(version)),
                Err(BridgeError::InvalidMessageVersion)
            ));
        }
    }

    #[test]
    fn parses_v2_without_optional_message() {
        let mint = Mint::from_message(&base_message(MSG_VERSION)).unwrap();
        assert_fixed_fields(&mint);
        assert!(mint.message.is_none());
    }

    #[test]
    fn parses_v2_with_short_optional_message_zero_padded() {
        for len in [1, 10, OPTIONAL_MESSAGE_SIZE - 1] {
            let mut message = base_message(MSG_VERSION);
            message.extend_from_slice(&vec![0xAB; len]);
            let mint = Mint::from_message(&message).unwrap();
            assert_fixed_fields(&mint);
            let optional = mint.message.unwrap();
            assert_eq!(&optional[..len], vec![0xAB; len].as_slice());
            assert_eq!(&optional[len..], vec![0u8; OPTIONAL_MESSAGE_SIZE - len].as_slice());
        }
    }

    #[test]
    fn parses_v2_with_full_optional_message() {
        let optional: Vec<u8> = (1..=OPTIONAL_MESSAGE_SIZE as u8).collect();
        let mut message = base_message(MSG_VERSION);
        message.extend_from_slice(&optional);
        let mint = Mint::from_message(&message).unwrap();
        assert_fixed_fields(&mint);
        assert_eq!(mint.message.unwrap().as_slice(), optional.as_slice());
    }

    #[test]
    fn truncates_v2_optional_message_longer_than_max() {
        let mut message = base_message(MSG_VERSION);
        message.extend_from_slice(&vec![0xCD; OPTIONAL_MESSAGE_SIZE + 12]);
        let mint = Mint::from_message(&message).unwrap();
        assert_fixed_fields(&mint);
        assert_eq!(mint.message.unwrap(), [0xCD; OPTIONAL_MESSAGE_SIZE]);
    }

    #[test]
    fn roundtrips_bridge_token_gmp_body() {
        for optional_message in [None, Some([0xEF; OPTIONAL_MESSAGE_SIZE])] {
            let body = BridgeToken {
                destination_token_address: TOKEN,
                sender: SENDER,
                recipient: RECIPIENT,
                amount: AMOUNT,
                optional_message,
            }
            .to_gmp_body();
            let mint = Mint::from_message(&body).unwrap();
            assert_fixed_fields(&mint);
            assert_eq!(mint.message, optional_message);
        }
    }
}
