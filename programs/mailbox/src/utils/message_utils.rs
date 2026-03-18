use std::io::{prelude::*, BufReader};

use anchor_lang::prelude::{borsh, AnchorDeserialize, AnchorSerialize};
use anchor_lang::solana_program::hash::hash  as sha256;
use anchor_lang::solana_program::keccak::hash as keccak256;

use crate::errors::MailboxError;

pub const PAYLOAD_SELECTOR_LENGTH: usize = 4;
pub const PAYLOAD_MIN_SIZE: usize = PAYLOAD_SELECTOR_LENGTH + 32 * 5;
pub const MESSAGE_V1_SELECTOR: [u8; PAYLOAD_SELECTOR_LENGTH] = [0xe2, 0x88, 0xfb, 0x4a];

pub fn message_path_identifier(
    source_mailbox_address: [u8; 32],
    source_chain_id: [u8; 32],
    destination_chain_id: [u8; 32],
) -> [u8; 32] {
    let mut buffer = [0u8; 96];
    buffer[..32].copy_from_slice(&source_mailbox_address);
    buffer[32..64].copy_from_slice(&source_chain_id);
    buffer[64..96].copy_from_slice(&destination_chain_id);
    keccak256(&buffer).to_bytes()
}

#[derive(Debug, Default, Clone, AnchorSerialize, AnchorDeserialize, PartialEq)]
pub struct MessageV1 {
    pub message_path_identifier: [u8; 32],
    pub nonce: u64,
    pub sender: [u8; 32],
    pub recipient: [u8; 32],
    pub destination_caller: Option<[u8; 32]>,
    pub body: Vec<u8>,
}

impl MessageV1 {
    pub fn size(body_length: usize) -> usize {
        return 32 + // message path identifier
        8 + // nonce
        32 + // sender
        32 + // recipient
        1 + 32 + // destination caller (1 for the option, 32 for the caller) 
        4 + body_length; // body length
    }

    /// Returns the number of bytes that are accountable for sending the message.
    /// This is the amount of bytes when this is encoded in ABI for consortium validation.
    pub fn accountable_abi_bytes(body_length: usize) -> u64 {
        4 + // payload selector
        32 + // message path identifier
        32 + // nonce
        32 + // sender
        32 + // recipient
        32 + // destination caller
        32 + // body offset
        32 + // body length
        body_length as u64 / 32 * 32 + // body length in 32 bytes slots
        // padding of abi that encodes in 32 bytes slots
        if body_length % 32 != 0 { 32 } else { 0 }
    }

    pub fn body_length(&self) -> usize {
        return self.body.len();
    }

    pub fn from_session_payload(bytes: &[u8]) -> Result<Self, MailboxError> {
        let mut reader = BufReader::new(bytes);

        // check length is at least for all static fields and length of dynamic fields
        // 32 for the tuple length and 32 for each field
        // plus 4 for the message selector
        if bytes.len() < 4 + 32 * 7 {
            return Err(MailboxError::InvalidPayloadLength);
        }

        // check selector
        let mut selector_bytes = [0u8; 4];
        reader.read_exact(&mut selector_bytes)?;
        if selector_bytes != MESSAGE_V1_SELECTOR {
            return Err(MailboxError::InvalidPayloadSelector);
        }

        let mut message_v1 = Self {
            message_path_identifier: [0u8; 32],
            nonce: 0,
            sender: [0u8; 32],
            recipient: [0u8; 32],
            destination_caller: None,
            body: Vec::new(),
        };

        // Read message path identifier
        reader.read_exact(&mut message_v1.message_path_identifier)?;

        // Read nonce
        let mut nonce_bytes = [0u8; 32];
        reader.read_exact(&mut nonce_bytes)?;
        message_v1.nonce = u64::from_be_bytes(nonce_bytes[24..32].try_into().unwrap());

        // Read sender
        reader.read_exact(&mut message_v1.sender)?;

        // Read recipient
        reader.read_exact(&mut message_v1.recipient)?;

        // Read destination caller
        let mut destination_caller_bytes = [0u8; 32];
        reader.read_exact(&mut destination_caller_bytes)?;
        if destination_caller_bytes != [0u8; 32] {
            message_v1.destination_caller = Some(destination_caller_bytes);
        }

        // Read body
        // Skip body vector offset
        reader.consume(32);
        let mut body_length_bytes = [0u8; 32];
        reader.read_exact(&mut body_length_bytes)?;
        let body_length = u64::from_be_bytes(body_length_bytes[24..32].try_into().unwrap());
        message_v1.body = vec![0u8; body_length as usize];
        reader.read_exact(&mut message_v1.body)?;

        Ok(message_v1)
    }

    pub fn to_session_payload(&self) -> Vec<u8> {
        let mut message = Vec::with_capacity(PAYLOAD_MIN_SIZE);

        message.extend_from_slice(&MESSAGE_V1_SELECTOR);
        message.extend_from_slice(&self.message_path_identifier);
        let mut nonce_bytes = [0u8; 32];
        nonce_bytes[24..].copy_from_slice(&self.nonce.to_be_bytes());
        message.extend_from_slice(&nonce_bytes);
        message.extend_from_slice(&self.sender);
        message.extend_from_slice(&self.recipient);
        match self.destination_caller {
            Some(dst_caller) => {
                message.extend_from_slice(&dst_caller);
            }
            None => {
                message.extend_from_slice(&[0u8; 32]);
            }
        }
        // Fist put the offset
        let mut offset_bytes = [0u8; 32];
        let offset: u64 = 192; // 32 * 6
        offset_bytes[24..].copy_from_slice(&offset.to_be_bytes());
        message.extend_from_slice(&offset_bytes);
        // Next put the length of the body
        let mut size_bytes = [0u8; 32];
        size_bytes[24..].copy_from_slice(&self.body.len().to_be_bytes());
        message.extend_from_slice(&size_bytes);
        // Next add the body
        message.extend_from_slice(&self.body); // ToDO: add padding to 
        // Lastly put some padding if necessary
        let padding_len = (32 - self.body.len() % 32) % 32;
        if padding_len > 0 {
            for _ in 0..padding_len {
                message.push(0);
            }
        }

        message
    }

    pub fn calculate_payload_hash(&self) -> ([u8; 32], Vec<u8>) {
        let payload = self.to_session_payload();
        (sha256(&payload).to_bytes(), payload)
    } 
}

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct SendResult {
    pub nonce: u64,
    pub payload_hash: [u8; 32],
}

#[cfg(test)]
mod tests {

    use super::*;

    #[test]
    fn test_message_path_identifier() {
        let mut source_mailbox_address = [0u8; 32];
        source_mailbox_address.copy_from_slice(
            &hex::decode("000000000000000000000000C7a9Fc9A8DF4dD23649bEfcbaf21Fe9A33B24F16")
                .unwrap(),
        );
        let mut source_chain_id = [0u8; 32];
        source_chain_id.copy_from_slice(
            &hex::decode("0000000000000000000000000000000000000000000000000000000000004268")
                .unwrap(),
        );
        let mut destination_chain_id = [0u8; 32];
        destination_chain_id.copy_from_slice(
            &hex::decode("0000000000000000000000000000000000000000000000000000000000014a34")
                .unwrap(),
        );
        let identifier = message_path_identifier(
            source_mailbox_address,
            source_chain_id,
            destination_chain_id,
        );
        assert_eq!(
            hex::encode(identifier),
            "bb58f679355382aec3ea0d060969c1147612b63078b963316334c4ba3e7e055b"
        );
    }

    #[test]
    fn test_message_v1_from_session_payload() {
        let message = MessageV1::from_session_payload(&hex::decode("e288fb4a019a0987851ce24a3fae474d3be39c2a3245c13421d41e978453f1f80452cbc100000000000000000000000000000000000000000000000000000000000000020000000000000000000000003c44cdddb6a900fa2b585dd299e03d12fa4293bc000000000000000000000000b2db398dc13ffb1e07306f96ae359de5f265eff1000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000c000000000000000000000000000000000000000000000000000000000000000045445535400000000000000000000000000000000000000000000000000000000").unwrap()).unwrap();
        assert_eq!(
            message.message_path_identifier.as_slice(),
            hex::decode("019a0987851ce24a3fae474d3be39c2a3245c13421d41e978453f1f80452cbc1")
                .unwrap()
                .as_slice()
        );
        assert_eq!(message.nonce, 2);
        assert_eq!(
            message.sender.as_slice(),
            hex::decode("0000000000000000000000003c44cdddb6a900fa2b585dd299e03d12fa4293bc")
                .unwrap()
                .as_slice()
        );
        assert_eq!(
            message.recipient.as_slice(),
            hex::decode("000000000000000000000000b2db398dc13ffb1e07306f96ae359de5f265eff1")
                .unwrap()
                .as_slice()
        );
        assert!(message.destination_caller.is_none());
        assert_eq!(message.body, hex::decode("54455354").unwrap());
    }

    #[test]
    fn test_message_v1_to_from_session_payload() {
        let payload_hex = "e288fb4a019a0987851ce24a3fae474d3be39c2a3245c13421d41e978453f1f80452cbc100000000000000000000000000000000000000000000000000000000000000020000000000000000000000003c44cdddb6a900fa2b585dd299e03d12fa4293bc000000000000000000000000b2db398dc13ffb1e07306f96ae359de5f265eff1000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000c000000000000000000000000000000000000000000000000000000000000000045445535400000000000000000000000000000000000000000000000000000000";
        let payload_bz = hex::decode(payload_hex).unwrap();
        let message = MessageV1::from_session_payload(&payload_bz).unwrap();
        let payload = message.to_session_payload();
        assert_eq!(payload, payload_bz);
    }

    #[test]
    fn test_message_v1_accountable_abi_bytes() {
        let payload_hex = "e288fb4a019a0987851ce24a3fae474d3be39c2a3245c13421d41e978453f1f80452cbc100000000000000000000000000000000000000000000000000000000000000020000000000000000000000003c44cdddb6a900fa2b585dd299e03d12fa4293bc000000000000000000000000b2db398dc13ffb1e07306f96ae359de5f265eff1000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000c000000000000000000000000000000000000000000000000000000000000000045445535400000000000000000000000000000000000000000000000000000000";
        let payload_bz = hex::decode(payload_hex).unwrap();
        let message = MessageV1::from_session_payload(&payload_bz).unwrap();
        let accountable_abi_bytes = MessageV1::accountable_abi_bytes(message.body_length());
        assert_eq!(accountable_abi_bytes, 260);
    }
}
