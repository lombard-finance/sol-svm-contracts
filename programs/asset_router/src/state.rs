use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct Config {
    // Authorities
    pub admin: Pubkey,
    pub pending_admin: Pubkey,
    pub treasury: Pubkey,

    // Global pause
    pub paused: bool,

    pub native_mint: Pubkey,

    pub mailbox: Pubkey,

    pub bascule_enabled: bool,

    // Reference LChainIds
    pub ledger_lchain_id: [u8; 32],
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
