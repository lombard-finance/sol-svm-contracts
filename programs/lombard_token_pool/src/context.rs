use anchor_lang::prelude::*;
use anchor_lang::solana_program;

#[derive(Accounts)]
pub struct Empty {}

#[cfg(feature = "mainnet")]
pub const BRIDGE_PROGRAM: Pubkey =
    solana_program::pubkey!("ToDo111111111111111111111111111111111111111");
#[cfg(feature = "gastald")]
pub const BRIDGE_PROGRAM: Pubkey =
    solana_program::pubkey!("LombUtstgyrZUhjvi12hUnm7HG7CxhtanUv6hakuCm4");
#[cfg(feature = "staging")]
pub const BRIDGE_PROGRAM: Pubkey =
    solana_program::pubkey!("LomS25cte2jkQoLbKembGB19gb2pMNKPFodwLHpMiWR");
#[cfg(feature = "bft")]
pub const BRIDGE_PROGRAM: Pubkey =
    solana_program::pubkey!("Lom9Em2WzV7gvtttdub9LZSR8gLgtbzFDhFm1zMQRp6");
#[cfg(any(feature = "localnet", not(any(feature = "mainnet", feature = "gastald", feature = "staging", feature = "bft"))))]
pub const BRIDGE_PROGRAM: Pubkey =
    solana_program::pubkey!("CAwQ43gQmFB6CD4zodoKt7ipPrHP7eQLxvGRY6tQ6zYx");

#[inline]
pub fn get_pda(seeds: &[&[u8]], program_id: &Pubkey) -> Pubkey {
    Pubkey::find_program_address(seeds, program_id).0
}