/// 0x02296998a6f8e2a784db5d9f95e18fc23f70441a1039446801089879b08c7ef0
#[cfg(feature = "mainnet")]
pub const SELF_CHAIN_ID: [u8; 32] = [
    2, 41, 105, 152, 166, 248, 226, 167, 132, 219, 93, 159, 149, 225, 143, 194, 63, 112, 68, 26,
    16, 57, 68, 104, 1, 8, 152, 121, 176, 140, 126, 240,
];

/// 0x0259db5080fc2c6d3bcf7ca90712d3c2e5e6c28f27f0dfbb9953bdb0894c03ab
#[cfg(not(feature = "mainnet"))]
pub const SELF_CHAIN_ID: [u8; 32] = [
    2, 89, 219, 80, 128, 252, 44, 109, 59, 207, 124, 169, 7, 18, 211, 194, 229, 230, 194, 143, 39,
    240, 223, 187, 153, 83, 189, 176, 137, 76, 3, 171,
];

pub const CONFIG_SEED: &[u8] = b"mailbox_config";
pub const SENDER_CONFIG_SEED: &[u8] = b"sender_config";
pub const OUTBOUND_MESSAGE_PATH_SEED: &[u8] = b"outbound_message_path";
pub const INBOUND_MESSAGE_PATH_SEED: &[u8] = b"inbound_message_path";
pub const MESSAGE_SEED: &[u8] = b"message";
pub const OUTBOUND_MESSAGE: &[u8] = b"outbound_message";
pub const ACCOUNT_ROLES_SEED: &[u8] = b"account_roles";

pub const MAX_PAYLOAD_SIZE: u32 = 1024 * 1024; // 1MB
pub const DEFAULT_FEE_PER_BYTE: u64 = 1000; // lamports per byte
pub const FEE_ADJUSTMET_BASE: u64 = 10000;
