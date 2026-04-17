use anchor_lang::prelude::*;

use base_token_pool::rate_limiter::RateLimitTokenBucket;
// todo: optimize by saving bumps for accounts used more often

#[account]
#[derive(InitSpace)]
pub struct Config {
    // Authorities
    pub admin: Pubkey,
    pub pending_admin: Pubkey,

    // Global pause
    pub paused: bool,

    // GMP Mailbox
    pub mailbox: Pubkey,
}

#[derive(Clone, Copy, AnchorSerialize, AnchorDeserialize, PartialEq, InitSpace)]
pub enum AccountRole {
    Pauser,
    None // a dummy case as it looks like anchor cannot serialize/deserialize if there is only one case
}

#[account]
#[derive(InitSpace)]
pub struct AccountRoles {
    #[max_len(3)] // to have some room for future roles
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
pub struct SenderConfig {
    pub bump: u8,
    pub fee_discount: u64,
    pub whitelisted: bool,
}

#[account]
#[derive(InitSpace)]
pub struct RemoteBridgeConfig {
    pub bump: u8,
    pub chain_id: [u8; 32],
    pub bridge: [u8; 32],
}

#[account]
#[derive(InitSpace)]
pub struct LocalTokenConfig {
    pub bump: u8,
    pub mint: Pubkey, 
}

#[account]
#[derive(InitSpace)]
pub struct RemoteTokenConfig {
    pub bump: u8,
    pub chain_id: [u8; 32],
    pub token: [u8; 32], 
    pub direction: u8,
    pub inbound_rate_limit: RateLimitTokenBucket,
}
