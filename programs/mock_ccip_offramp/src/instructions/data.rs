use anchor_lang::prelude::*;

#[derive(Debug, Clone, AnchorSerialize, AnchorDeserialize)]
pub struct ReleaseOrMintInV1 {
    pub(crate) original_sender: Vec<u8>, //          The original sender of the tx on the source chain
    pub(crate) remote_chain_selector: u64, // ─╮ The chain ID of the source chain
    pub(crate) receiver: Pubkey,         // ───────────╯ The recipient of the tokens on the destination chain.
    pub(crate) amount: [u8; 32], // u256, incoming cross-chain amount - The amount of tokens to release or mint, denominated in the source token's decimals
    pub(crate) local_token: Pubkey, //            The address on this chain of the token to release or mint
    /// @dev WARNING: sourcePoolAddress should be checked prior to any processing of funds. Make sure it matches the
    /// expected pool address for the given remoteChainSelector.
    pub(crate) source_pool_address: Vec<u8>, //       The address of the source pool, abi encoded in the case of EVM chains
    pub(crate) source_pool_data: Vec<u8>, //          The data received from the source pool to process the release or mint
    /// @dev WARNING: offchainTokenData is untrusted data.
    pub(crate) offchain_token_data: Vec<u8>, //       The offchain data to process the release or mint
}

pub const TOKENPOOL_RELEASE_OR_MINT_DISCRIMINATOR: [u8; 8] =
    [0x5c, 0x64, 0x96, 0xc6, 0xfc, 0x3f, 0xa4, 0xe4]; // release_or_mint_tokens

impl ReleaseOrMintInV1 {
    pub fn to_tx_data(&self) -> Vec<u8> {
        let mut data = Vec::new();
        data.extend_from_slice(&TOKENPOOL_RELEASE_OR_MINT_DISCRIMINATOR);
        data.extend_from_slice(&self.try_to_vec().unwrap());
        data
    }
}

#[derive(Clone, AnchorSerialize, AnchorDeserialize, Debug)]
pub struct LockOrBurnInV1 {
    pub receiver: Vec<u8>, //  The recipient of the tokens on the destination chain
    pub remote_chain_selector: u64, // The chain ID of the destination chain
    pub original_sender: Pubkey, // The original sender of the tx on the source chain
    pub amount: u64, // local solana amount to lock/burn,  The amount of tokens to lock or burn, denominated in the source token's decimals
    pub local_token: Pubkey, //  The address on this chain of the token to lock or burn
    pub msg_total_nonce: u64, // The onramp total nonce for the current message, given the original_sender & remote chain selector
}
const TOKENPOOL_LOCK_OR_BURN_DISCRIMINATOR: [u8; 8] =
    [0x72, 0xa1, 0x5e, 0x1d, 0x93, 0x19, 0xe8, 0xbf]; // lock_or_burn_tokens

impl LockOrBurnInV1 {
    pub fn to_tx_data(&self) -> Vec<u8> {
        let mut data = Vec::new();
        data.extend_from_slice(&TOKENPOOL_LOCK_OR_BURN_DISCRIMINATOR);
        data.extend_from_slice(&self.try_to_vec().unwrap());
        data
    }
}
