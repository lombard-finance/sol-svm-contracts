use std::{cmp, io::{BufReader, prelude::*}};
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
        mint.amount = u64::from_be_bytes(amount_bytes[24..32].try_into().unwrap());
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
