use anchor_lang::prelude::*;
use anchor_lang::solana_program::keccak::hash as keccak256;

/// This is the message reporters use to report a mint.
#[derive(Clone, AnchorSerialize, AnchorDeserialize)]
pub struct MintMessage {
    pub nonce: u64,
    pub token_address: [u8; 32],
    pub recipient: [u8; 32],
    pub amount: u64,
}

fn u64_to_32_be_bytes(v: u64) -> [u8; 32] {
    let mut buf = [0u8; 32];
    buf[24..32].copy_from_slice(&v.to_be_bytes());
    buf
}

impl MintMessage {
    /// Returns the mint message id (keccak256 of nonce || token_address || recipient || amount).
    /// amount and nonce are padded to 32 bytes as in evm abi encoding.
    pub fn mint_id(&self) -> [u8; 32] {
        let mut data = [0u8; 32 + 32 + 32 + 32];
        data[0..32].copy_from_slice(&u64_to_32_be_bytes(self.nonce));
        data[32..64].copy_from_slice(&self.token_address);
        data[64..96].copy_from_slice(&self.recipient);
        data[96..128].copy_from_slice(&u64_to_32_be_bytes(self.amount));
        keccak256(&data).to_bytes()
    }
}

/// ECDSA proof that the trusted signer signed the mint id.
#[derive(Clone, AnchorSerialize, AnchorDeserialize)]
pub struct MintProof {
    pub signature: [u8; 64],
    pub recovery_id: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Config {
    pub admin: Pubkey,
    pub pending_admin: Pubkey,
    pub paused: bool,
    /// Amount above which a mint must be in Reported state before a validator can set it to Minted.
    pub validate_threshold: u64,
    /// Secp256k1 public key (64 bytes, uncompressed without leading 0x04) of the trusted signer
    /// who must sign all reported mint message ids.
    pub trusted_signer: [u8; 64],
}

/// States for a mint payload. Unreported is the default (no PDA exists).
#[derive(Debug, Default, Clone, Copy, InitSpace, AnchorSerialize, AnchorDeserialize, PartialEq)]
pub enum MintPayloadState {
    #[default]
    Unreported,
    Reported,
    Minted,
}

#[account]
#[derive(InitSpace)]
pub struct MintPayload {
    pub state: MintPayloadState,
    pub amount: u64,
}

#[derive(Clone, Copy, AnchorSerialize, AnchorDeserialize, PartialEq, InitSpace)]
pub enum AccountRole {
    Pauser,
    MintReporter,
    MintValidator,
    ValidationGuardian,
}

#[account]
#[derive(InitSpace)]
pub struct AccountRoles {
    #[max_len(5)] // 4 roles + room for future in case needed
    pub roles: Vec<AccountRole>,
}

impl AccountRoles {
    pub fn add_role(&mut self, role: AccountRole) {
        if !self.roles.contains(&role) {
            self.roles.push(role);
        }
    }

    pub fn has_role(&self, role: AccountRole) -> bool {
        self.roles.iter().any(|r| *r == role)
    }
}
