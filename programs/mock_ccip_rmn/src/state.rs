use anchor_lang::prelude::*;

#[derive(Debug, PartialEq, Eq, Clone, Copy, InitSpace, AnchorDeserialize, AnchorSerialize)]
#[repr(u8)]
pub enum CodeVersion {
    Default = 0,
    V1,
}

#[account]
#[derive(InitSpace, Debug)]
pub struct Config {
    pub version: u8,
    pub owner: Pubkey,

    pub proposed_owner: Pubkey,
    pub default_code_version: CodeVersion,
}

#[derive(Debug, PartialEq, Eq, Clone, Copy, InitSpace, AnchorDeserialize, AnchorSerialize)]
pub struct CurseSubject {
    pub value: [u8; 16],
}

impl CurseSubject {
    // Global curse subject, standardized across chains and chain families. If this subject is
    // cursed, all lanes starting to or ending in this chain are disabled.
    pub const GLOBAL: Self = {
        Self {
            value: [
                0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
                0x00, 0x01,
            ],
        }
    };

    pub const fn from_chain_selector(selector: u64) -> Self {
        Self {
            value: (selector as u128).to_le_bytes(),
        }
    }

    pub const fn from_bytes(bytes: [u8; 16]) -> Self {
        Self { value: bytes }
    }
}

#[account]
#[derive(InitSpace, Debug)]
pub struct Curses {
    pub version: u8,
    #[max_len(0)]
    pub cursed_subjects: Vec<CurseSubject>,
}

impl Curses {
    pub fn dynamic_len(&self) -> usize {
        Self::INIT_SPACE + self.cursed_subjects.len() * CurseSubject::INIT_SPACE
    }
}
