pub const CONFIG_SEED: &[u8] = b"bascule_gmp_config";
pub const ACCOUNT_ROLES_SEED: &[u8] = b"account_roles";
pub const MINT_PAYLOAD_SEED: &[u8] = b"mint_payload";

/// 0x02296998a6f8e2a784db5d9f95e18fc23f70441a1039446801089879b08c7ef0
#[cfg(any(feature = "mainnet",feature = "localnet"))]
pub const CHAIN_ID: [u8; 32] = [
    2, 41, 105, 152, 166, 248, 226, 167, 132, 219, 93, 159, 149, 225, 143, 194, 63, 112, 68, 26,
    16, 57, 68, 104, 1, 8, 152, 121, 176, 140, 126, 240,
];

/// 0x0259db5080fc2c6d3bcf7ca90712d3c2e5e6c28f27f0dfbb9953bdb0894c03ab
#[cfg(not(any(feature = "mainnet",feature = "localnet")))]
pub const CHAIN_ID: [u8; 32] = [
    2, 89, 219, 80, 128, 252, 44, 109, 59, 207, 124, 169, 7, 18, 211, 194, 229, 230, 194, 143, 39,
    240, 223, 187, 153, 83, 189, 176, 137, 76, 3, 171,
];