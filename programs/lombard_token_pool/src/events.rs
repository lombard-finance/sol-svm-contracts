use anchor_lang::prelude::*;

use crate::state::{LombardChain};

#[event]
pub struct RemoteChainLombardConfigChanged {
    pub config: LombardChain,
}

#[event]
pub struct CcipLombardMessageSentEvent {
    // Seeds for the CCTP message sent event account
    pub original_sender: Pubkey,
    pub remote_chain_selector: u64,
    pub msg_total_nonce: u64,

    // Actual event account address, derived from the seeds above
    pub event_address: Pubkey,

    // CCTP values identifying the message
    pub source_domain: u32, // The source chain domain ID, which for Solana is always 5
    pub bridge_nonce: u64,

    // CCTP message bytes, used to get the attestation offchain and receive the message on dest
    pub message_sent_bytes: Vec<u8>,
}

#[event]
pub struct CcipLombardMessageEventAccountClosed {
    // Seeds for the CCTP message sent event account
    original_sender: Pubkey,
    remote_chain_selector: u64,
    msg_total_nonce: u64,
    // Actual event account address, derived from the seeds above
    address: Pubkey,
}
