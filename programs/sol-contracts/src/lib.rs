use anchor_lang::prelude::*;

mod decoder;
pub mod errors;

declare_id!("DG958H3tYj3QWTDPjsisb9CxS6TpdMUznYpgVg5bRd8P");

#[program]
pub mod lbtc {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        Ok(())
    }

    pub fn mint_from_payload(ctx: Context<MintFromPayload>, bytes: Vec<u8>) -> Result<()> {
        let mint_action = decoder::decode_mint_action(ctx, bytes)?;
        Ok(())
    }

    pub fn redeem(ctx: Context<Redeem>) -> Result<()> {
        Ok(())
    }

    pub fn set_initial_valset(ctx: Context<SetValset>, bytes: Vec<u8>) -> Result<()> {
        let valset_action = decoder::decode_valset_action(ctx, bytes)?;
        Ok(())
    }

    pub fn set_next_valset(ctx: Context<SetValset>, bytes: Vec<u8>) -> Result<()> {
        let valset_action = decoder::decode_valset_action(ctx, bytes)?;
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(
        init,
        payer = payer,
        space = 8 + Config::INIT_SPACE
    )]
    pub config: Account<'info, Config>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct MintFromPayload<'info> {
    pub config: Account<'info, Config>,
}

#[derive(Accounts)]
pub struct SetValset<'info> {
    pub config: Account<'info, Config>,
}

#[derive(Accounts)]
pub struct Redeem<'info> {
    pub config: Account<'info, Config>,
}

#[account]
#[derive(InitSpace)]
pub struct Config {
    pub chain_id: [u8; 32],
    pub deposit_btc_action: u32,
    pub set_valset_action: u32,
    pub treasury_address: Pubkey,
    pub burn_commission: u64,
    pub withdrawals_enabled: bool,
    pub paused: bool,
    pub dust_fee_rate: u64,
    pub mint_fee: u64,
    pub bascule_enabled: bool,
}
