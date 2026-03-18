use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct Config {
    // Authorities
    pub admin: Pubkey,
    // The address of the pending admin when a change is in progress
    pub pending_admin: Pubkey,
    // The address to collect fees
    pub treasury: Pubkey,

    // Global pause
    pub paused: bool,
    // The token mint to use for native representation of BTC
    pub native_mint: Pubkey,
    // The reference Lombard security consortium program
    pub consortium: Pubkey,
    // The reference mailbox program for sending/receiving messages among Lombard components
    pub mailbox: Pubkey,
    /// When Some, mint_from_payload makes a CPI to bascule validate_withdrawal before minting.
    pub bascule: Option<Pubkey>,
    /// When Some, gmp_receive makes a CPI to bascule_gmp validate_mint before minting.
    pub bascule_gmp: Option<Pubkey>,

    // Reference Lombard Chain IDs

    // The Lombard Chain ID of the Lombard Ledger
    pub ledger_lchain_id: [u8; 32],
    // The Lombard Chain ID of the Bitcoin blockchain
    pub bitcoin_lchain_id: [u8; 32],
}

#[account]
#[derive(InitSpace)]
pub struct TokenConfig {
    pub redeem_fee: u64,
    pub redeem_for_btc_min_amount: u64,
    pub max_mint_commission: u64,
    pub to_native_commission: u64,
    pub ledger_redeem_handler: [u8; 32],
}

#[derive(Clone, Copy, AnchorSerialize, AnchorDeserialize, PartialEq, InitSpace)]
pub enum TokenRouteType {
    Deposit,
    Redeem,
}

#[account]
#[derive(InitSpace)]
pub struct TokenRoute {
    pub route_type: TokenRouteType,
}

#[account]
#[derive(InitSpace)]
pub struct Ratio {
    pub value: u128,
}

#[account]
pub struct DepositPayloadSpent {}

#[derive(Clone, Copy, AnchorSerialize, AnchorDeserialize, PartialEq, InitSpace)]
pub enum AccountRole {
    Operator,
    Pauser,
    Claimer,
}

#[account]
#[derive(InitSpace)]
pub struct AccountRoles {
    #[max_len(3)]
    pub roles: Vec<AccountRole>,
}

impl AccountRoles {
    pub fn add_role(&mut self, role: AccountRole) {
        self.roles.push(role);
    }

    pub fn has_role(&self, role: AccountRole) -> bool {
        self.roles.iter().any(|r| *r == role)
    }
}

#[account]
#[derive(InitSpace)]
pub struct MessageHandled {}

#[account]
#[derive(InitSpace)]
pub struct MessagingAuthority {}
