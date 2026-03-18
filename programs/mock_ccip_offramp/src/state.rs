use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct Config {
    // Lombard Token Pool
    pub token_pool: Pubkey,
}

#[account]
pub struct ReleaseOrMintInV1Data {
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
    pub(crate) nonce: u16,
}

impl ReleaseOrMintInV1Data {
    pub fn size(offchain_token_data_size: usize) -> usize {
        return 225 + offchain_token_data_size; // 1 for the status enum + 7 * 32
    }
}
