use anchor_lang::prelude::*;
use anchor_lang::solana_program::keccak::hash as keccak256;

/// This is the message reporters use to report a mint.
#[derive(Clone, AnchorSerialize, AnchorDeserialize)]
pub struct MintMessage {
    pub nonce: u64,
    pub chain_id: [u8; 32],
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
    /// Returns the mint message id (keccak256 of nonce || chain_id || recipient || token_address || amount).
    /// amount and nonce are padded to 32 bytes as in evm abi encoding.
    pub fn mint_id(&self) -> [u8; 32] {
        let mut data = [0u8; 32 + 32 + 32 + 32 + 32];
        data[0..32].copy_from_slice(&u64_to_32_be_bytes(self.nonce));
        data[32..64].copy_from_slice(&self.chain_id);
        data[64..96].copy_from_slice(&self.recipient);
        data[96..128].copy_from_slice(&self.token_address);
        data[128..160].copy_from_slice(&u64_to_32_be_bytes(self.amount));
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

mod tests {
    use super::*;

    #[test]
    fn expected_mint_id() {
        let mint_message_1 = MintMessage {
            nonce: 90,
            chain_id: hex::decode("0259DB5080FC2C6D3BCF7CA90712D3C2E5E6C28F27F0DFBB9953BDB0894C03AB").unwrap().try_into().unwrap(),
            token_address: hex::decode("000BD156D154D44CD8C8AB597D5546CA8C128162688E7575A385F1F451DCE66A").unwrap().try_into().unwrap(),
            recipient: hex::decode("C6C6C8CD4768E8FC8E8AE762C42D3CB30D15322BA1335D16FE9AA1AC674CEE3F").unwrap().try_into().unwrap(),
            amount: 20997,
        };

        let mint_id = mint_message_1.mint_id();
        assert_eq!(hex::encode(mint_id), "9bf81f1857e647c7dfd3e63d725adc8305412d97af2983aadcbc3a8a263c585a");

        let mint_message_2 = MintMessage {
            nonce: 88,
            chain_id: hex::decode("0259DB5080FC2C6D3BCF7CA90712D3C2E5E6C28F27F0DFBB9953BDB0894C03AB").unwrap().try_into().unwrap(),
            token_address: hex::decode("9B4B122FFE8A8C36560F89107D538837EB0ADD2E479B0ABD9FE1166E080058F7").unwrap().try_into().unwrap(),
            recipient: hex::decode("FB1E74C11EDE2A54E334704622BB89902FB58319DD39267A098F6FDFA80E5FF0").unwrap().try_into().unwrap(),
            amount: 3300,
        };

        let mint_id = mint_message_2.mint_id();
        assert_eq!(hex::encode(mint_id), "6865713829701f2c95c89703eaf568a992dec75ab3aa2386b69252ff7ab73917");
    }
}