use std::io::{prelude::*, BufReader};

use crate::errors::AssetRouterError;

// The type of the ABI encoded message with fields:
// destination chain id, staking token address, sender, recipient, amount
// bytes4(keccak256("deposit(bytes32,bytes32,bytes32,bytes32,uint256)"))
pub const DEPOSIT_SELECTOR: [u8; 4] = [0xcc, 0xb4, 0x12, 0x15];

// The type of the ABI encoded message with fields:
// token, recipient, amount
// bytes4(keccak256("mint(bytes32,bytes32,uint256)"))
pub const MINT_SELECTOR: [u8; 4] = [0x15, 0x5b, 0x6b, 0x13];
// 4 for the selector, 32 for each field (all static size)
pub const MINT_MESSAGE_LENGTH: usize = 4 + 32 * 3;

// The type of the ABI encoded message with fields:
// destination chain id, from staking token, recipient, amount
// bytes4(keccak256("redeem(bytes32,bytes32,bytes32,bytes,uint256)"))
pub const REDEEM_SELECTOR: [u8; 4] = [0xaa, 0x3d, 0xb8, 0x5f];

// The type of the ABI encoded message with fields:
// sender, script pubkey, amount
// bytes4(keccak256("redeemForBtc(bytes32,bytes,uint256)"))
pub const REDEEM_FOR_BTC_SELECTOR: [u8; 4] = [0x4e, 0x3e, 0x50, 0x47];

pub struct Deposit {
    pub destination_chain_id: [u8; 32],
    pub staking_token_address: [u8; 32],
    pub sender: [u8; 32],
    pub recipient: [u8; 32],
    pub amount: u64,
}

impl Deposit {
    pub fn to_gmp_body(&self) -> Vec<u8> {
        let mut message = Vec::new();
        message.extend_from_slice(&DEPOSIT_SELECTOR);
        message.extend_from_slice(&self.destination_chain_id);
        message.extend_from_slice(&self.staking_token_address);
        message.extend_from_slice(&self.sender);
        message.extend_from_slice(&self.recipient);
        let mut amount_bytes = [0u8; 32];
        amount_bytes[24..].copy_from_slice(&self.amount.to_be_bytes());
        message.extend_from_slice(&amount_bytes);
        message
    }
}

pub struct Mint {
    pub token_address: [u8; 32],
    pub recipient: [u8; 32],
    pub amount: u64,
}

impl Mint {
    pub fn from_message(message: &[u8]) -> Result<Self, AssetRouterError> {
        if message.len() != MINT_MESSAGE_LENGTH {
            return Err(AssetRouterError::InvalidMessageLength);
        }

        let mut reader = BufReader::new(message);

        let mut selector = [0u8; 4];
        reader.read_exact(&mut selector)?;
        if selector != MINT_SELECTOR {
            return Err(AssetRouterError::InvalidMessageSelector);
        }

        let mut mint = Self {
            token_address: [0u8; 32],
            recipient: [0u8; 32],
            amount: 0,
        };

        reader.read_exact(&mut mint.token_address)?;
        reader.read_exact(&mut mint.recipient)?;

        let mut amount_bytes = [0u8; 32];
        reader.read_exact(&mut amount_bytes)?;
        mint.amount = u64::from_be_bytes(amount_bytes[24..32].try_into().unwrap());

        Ok(mint)
    }
}

pub struct Redeem {
    pub destination_chain_id: [u8; 32],
    pub from_token_address: [u8; 32],
    pub sender: [u8; 32],
    pub recipient: Vec<u8>,
    pub amount: u64,
}

impl Redeem {
    pub fn to_gmp_body(&self) -> Vec<u8> {
        let mut message = Vec::new();
        message.extend_from_slice(&REDEEM_SELECTOR);
        message.extend_from_slice(&self.destination_chain_id);
        message.extend_from_slice(&self.from_token_address);
        message.extend_from_slice(&self.sender);

        // recipient is encoded as bytes so as a dynamic field:
        // offset to data first, then the data lenght and finally the data
        let mut recipient_offset = [0u8; 32];
        recipient_offset[24..].copy_from_slice(&160_u64.to_be_bytes());
        message.extend_from_slice(&recipient_offset);

        let mut amount_bytes = [0u8; 32];
        amount_bytes[24..].copy_from_slice(&self.amount.to_be_bytes());
        message.extend_from_slice(&amount_bytes);

        // finally add recipent data
        let mut recipient_data_length = [0u8; 32];
        recipient_data_length[24..].copy_from_slice(&(self.recipient.len() as u64).to_be_bytes());
        message.extend_from_slice(&recipient_data_length);

        // abi encodes in 32 bytes chunks so need to add padding if necessary
        for i in (0..self.recipient.len()).step_by(32) {
            if i + 32 > self.recipient.len() {
                let mut padding = [0u8; 32];
                padding[..self.recipient.len() - i].copy_from_slice(&self.recipient[i..]);
                message.extend_from_slice(&padding);
            } else {
                message.extend_from_slice(&self.recipient[i..i + 32]);
            }
        }

        message
    }
}

pub struct RedeemForBtc {
    pub sender: [u8; 32],
    pub script_pubkey: Vec<u8>,
    pub amount: u64,
}

impl RedeemForBtc {
    pub fn to_gmp_body(&self) -> Vec<u8> {
        let mut message = Vec::new();
        message.extend_from_slice(&REDEEM_FOR_BTC_SELECTOR);
        message.extend_from_slice(&self.sender);

        // recipient is encoded as bytes so as a dynamic field:
        // offset to data first, then the data length and finally the data
        let mut recipient_offset = [0u8; 32];
        recipient_offset[24..].copy_from_slice(&96_u64.to_be_bytes());
        message.extend_from_slice(&recipient_offset);

        let mut amount_bytes = [0u8; 32];
        amount_bytes[24..].copy_from_slice(&self.amount.to_be_bytes());
        message.extend_from_slice(&amount_bytes);

        // finally add script pubkey data
        let mut script_pubkey_data_length = [0u8; 32];
        script_pubkey_data_length[24..]
            .copy_from_slice(&(self.script_pubkey.len() as u64).to_be_bytes());
        message.extend_from_slice(&script_pubkey_data_length);

        // abi encodes in 32 bytes chunks so need to add padding if necessary
        for i in (0..self.script_pubkey.len()).step_by(32) {
            if i + 32 > self.script_pubkey.len() {
                let mut padding = [0u8; 32];
                padding[..self.script_pubkey.len() - i].copy_from_slice(&self.script_pubkey[i..]);
                message.extend_from_slice(&padding);
            } else {
                message.extend_from_slice(&self.script_pubkey[i..i + 32]);
            }
        }

        message
    }
}

// todo: test redeem gmp message encoding
