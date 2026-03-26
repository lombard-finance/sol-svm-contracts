/// 0x02296998a6f8e2a784db5d9f95e18fc23f70441a1039446801089879b08c7ef0
#[cfg(feature = "mainnet")]
pub const CHAIN_ID: [u8; 32] = [
    2, 41, 105, 152, 166, 248, 226, 167, 132, 219, 93, 159, 149, 225, 143, 194, 63, 112, 68, 26,
    16, 57, 68, 104, 1, 8, 152, 121, 176, 140, 126, 240,
];

/// 0x0259db5080fc2c6d3bcf7ca90712d3c2e5e6c28f27f0dfbb9953bdb0894c03ab
#[cfg(not(feature = "mainnet"))]
pub const CHAIN_ID: [u8; 32] = [
    2, 89, 219, 80, 128, 252, 44, 109, 59, 207, 124, 169, 7, 18, 211, 194, 229, 230, 194, 143, 39,
    240, 223, 187, 153, 83, 189, 176, 137, 76, 3, 171,
];

// PDA seeds
pub const TOKEN_AUTHORITY_SEED: &[u8] = b"token_authority";
pub const CONFIG_SEED: &[u8] = b"asset_router_config";
pub const DEPOSIT_PAYLOAD_SPENT_SEED: &[u8] = b"deposit_payload_spent";
pub const ACCOUNT_ROLES_SEED: &[u8] = b"account_roles";
pub const TOKEN_CONFIG_SEED: &[u8] = b"token_config";
pub const TOKEN_ROUTE_SEED: &[u8] = b"token_route";
pub const RATIO_SEED: &[u8] = b"ratio";
pub const MESSAGE_HANDLED_SEED: &[u8] = b"message_handled";
pub const MESSAGING_AUTHORITY_SEED: &[u8] = b"messaging_authority";
pub const BASCULE_VALIDATOR_SEED: &[u8] = b"bascule_validator";

// Logic constants
pub const BTC_DECIMALS: u8 = 8;
pub const MAX_FEE: u64 = 100000;
pub const BITCOIN_TOKEN_ADDRESS: [u8; 32] = [
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01,   
];

// Ledger constants
pub const BTC_STAKING_MODULE_ADDRESS: [u8; 32] = [
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x89, 0xe3, 0xe4, 0xe7,
    0xa6, 0x99, 0xd6, 0xf1, 0x31, 0xd8, 0x93, 0xae, 0xef, 0x7e, 0xe1, 0x43, 0x70, 0x6a, 0xc2, 0x3a,
];
