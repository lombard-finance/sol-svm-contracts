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

    pub fn mint_from_payload(ctx: Context<Cfg>, bytes: Vec<u8>) -> Result<()> {
        let mint_action = decoder::decode_mint_action(ctx.accounts.config, bytes)?;
        Ok(())
    }

    pub fn redeem(ctx: Context<Cfg>) -> Result<()> {
        Ok(())
    }

    pub fn set_initial_valset(ctx: Context<Admin>, bytes: Vec<u8>) -> Result<()> {
        let valset_action = decoder::decode_valset_action(ctx.accounts.config, bytes)?;
        Ok(())
    }

    pub fn set_next_valset(ctx: Context<Cfg>, bytes: Vec<u8>) -> Result<()> {
        let valset_action = decoder::decode_valset_action(ctx.accounts.config, bytes)?;
        Ok(())
    }

    pub fn toggle_withdrawals(ctx: Context<Admin>) -> Result<()> {
        ctx.accounts.config.withdrawals_enabled = !ctx.accounts.config.withdrawals_enabled;
        Ok(())
    }

    pub fn toggle_bascule(ctx: Context<Admin>) -> Result<()> {
        ctx.accounts.config.bascule_enabled = !ctx.accounts.config.bascule_enabled;
        Ok(())
    }

    pub fn set_mint_fee(ctx: Context<Operator>, mint_fee: u64) -> Result<()> {
        ctx.accounts.config.mint_fee = mint_fee;
        Ok(())
    }

    pub fn set_treasury_address(ctx: Context<Admin>, treasury: Pubkey) -> Result<()> {
        ctx.accounts.config.treasury = treasury;
        Ok(())
    }

    pub fn set_burn_commission(ctx: Context<Admin>, commission: u64) -> Result<()> {
        ctx.accounts.config.burn_commission = commission;
        Ok(())
    }

    pub fn set_pauser(ctx: Context<Admin>, pauser: Pubkey) -> Result<()> {
        ctx.accounts.config.pauser = pauser;
        Ok(())
    }

    pub fn set_operator(ctx: Context<Admin>, operator: Pubkey) -> Result<()> {
        ctx.accounts.config.operator = operator;
        Ok(())
    }

    pub fn set_bascule(ctx: Context<Admin>, bascule: Pubkey) -> Result<()> {
        ctx.accounts.config.bascule = bascule;
        Ok(())
    }

    pub fn set_dust_fee_rate(ctx: Context<Admin>, rate: u64) -> Result<()> {
        ctx.accounts.config.dust_fee_rate = rate;
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
pub struct Cfg<'info> {
    pub config: Account<'info, Config>,
}

#[derive(Accounts)]
pub struct Admin<'info> {
    #[account(address = config.admin)]
    pub payer: Signer<'info>,
    pub config: Account<'info, Config>,
}

#[derive(Accounts)]
pub struct Pauser<'info> {
    #[account(address = config.pauser)]
    pub payer: Signer<'info>,
    pub config: Account<'info, Config>,
}

#[derive(Accounts)]
pub struct Operator<'info> {
    #[account(address = config.operator)]
    pub payer: Signer<'info>,
    pub config: Account<'info, Config>,
}

#[account]
#[derive(InitSpace)]
pub struct Config {
    // Authorities
    pub admin: Pubkey,
    pub pauser: Pubkey,
    pub operator: Pubkey,
    //#[max_len(100)]
    //pub minters: Vec<Pubkey>,
    //#[max_len(100)]
    //pub claimers: Vec<Pubkey>,

    // Decoder fields
    pub chain_id: [u8; 32],
    pub deposit_btc_action: u32,
    pub set_valset_action: u32,

    // Mint/redeem fields
    pub burn_commission: u64,
    pub withdrawals_enabled: bool,
    pub dust_fee_rate: u64,
    pub bascule_enabled: bool,
    pub bascule: Pubkey,

    // Global pause
    pub paused: bool,

    // Automint fields
    pub treasury: Pubkey,
    pub mint_fee: u64,

    // Consortium fields
    pub epoch: u64,
    #[max_len(102)]
    pub validators: Vec<[u8; 32]>,
    #[max_len(102)]
    pub weights: Vec<u64>,
    pub weight_threshold: u64,
}
