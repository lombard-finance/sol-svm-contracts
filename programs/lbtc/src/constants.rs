/// 0x02296998a6f8e2a784db5d9f95e18fc23f70441a1039446801089879b08c7ef0
#[cfg(feature = "mainnet")]
pub const CHAIN_ID: [u8; 32] = [
    2, 41, 105, 152, 166, 248, 226, 167, 132, 219, 93, 159, 149, 225, 143, 194, 63, 112, 68, 26,
    16, 57, 68, 104, 1, 8, 152, 121, 176, 140, 126, 240,
];

/// 0x0259db5080fc2c6d3bcf7ca90712d3c2e5e6c28f27f0dfbb9953bdb0894c03ab
#[cfg(any(feature = "devnet"))]
pub const CHAIN_ID: [u8; 32] = [
    2, 89, 219, 80, 128, 252, 44, 109, 59, 207, 124, 169, 7, 18, 211, 194, 229, 230, 194, 143, 39,
    240, 223, 187, 153, 83, 189, 176, 137, 76, 3, 171,
];

/// bytes4(keccak256("payload(bytes32,bytes32,uint64,bytes32,uint32)"))
pub const DEPOSIT_BTC_ACTION: u32 = 0xf2e73f7c;
/// bytes4(keccak256("feeApproval(bytes32,bytes32,uint256,uint256)"))
pub const FEE_APPROVAL_ACTION: u32 = 0x04acbbb2;
/// bytes4(keccak256("payload(uint256,bytes[],uint256[],uint256,uint256)"))
pub const NEW_VALSET_ACTION: u32 = 0x4aab1d6f;

pub const TOKEN_AUTHORITY_SEED: &[u8] = b"token_authority";
pub const MIN_VALIDATOR_SET_SIZE: usize = 1;
pub const MAX_VALIDATOR_SET_SIZE: usize = 102;
pub const MINT_PAYLOAD_LEN: usize = 164;
pub const FEE_PAYLOAD_LEN: usize = 132;
pub const METADATA_SEED: [u8; 32] = [
    1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1,
];
pub const VALIDATOR_PUBKEY_SIZE: usize = 64;
pub const LBTC_DECIMALS: u8 = 8;
pub const MAX_FEE: u64 = 100000;
