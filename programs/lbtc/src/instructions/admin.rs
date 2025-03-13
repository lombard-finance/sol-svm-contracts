//! Collection of admin-privileged functionality.
use crate::{
    errors::LBTCError,
    events::{
        BasculeChanged, BasculeEnabled, BurnCommissionSet, ClaimerAdded, ClaimerRemoved,
        DustFeeRateSet, MinterAdded, MinterRemoved, OperatorSet, PauseEnabled, PauserAdded,
        PauserRemoved, TreasuryChanged, WithdrawalsEnabled,
    },
    state::Config,
};
use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct Admin<'info> {
    #[account(address = config.admin)]
    pub payer: Signer<'info>,
    #[account(mut)]
    pub config: Account<'info, Config>,
}

pub fn enable_withdrawals(ctx: Context<Admin>) -> Result<()> {
    ctx.accounts.config.withdrawals_enabled = true;
    emit!(WithdrawalsEnabled { enabled: true });
    Ok(())
}

pub fn disable_withdrawals(ctx: Context<Admin>) -> Result<()> {
    ctx.accounts.config.withdrawals_enabled = false;
    emit!(WithdrawalsEnabled { enabled: false });
    Ok(())
}

pub fn enable_bascule(ctx: Context<Admin>) -> Result<()> {
    ctx.accounts.config.bascule_enabled = true;
    emit!(BasculeEnabled { enabled: true });
    Ok(())
}

pub fn disable_bascule(ctx: Context<Admin>) -> Result<()> {
    ctx.accounts.config.bascule_enabled = false;
    emit!(BasculeEnabled { enabled: false });
    Ok(())
}

pub fn set_burn_commission(ctx: Context<Admin>, commission: u64) -> Result<()> {
    ctx.accounts.config.burn_commission = commission;
    emit!(BurnCommissionSet {
        burn_commission: commission
    });
    Ok(())
}

pub fn set_operator(ctx: Context<Admin>, operator: Pubkey) -> Result<()> {
    ctx.accounts.config.operator = operator;
    emit!(OperatorSet { operator });
    Ok(())
}

pub fn set_dust_fee_rate(ctx: Context<Admin>, rate: u64) -> Result<()> {
    ctx.accounts.config.dust_fee_rate = rate;
    emit!(DustFeeRateSet { rate });
    Ok(())
}

pub fn set_treasury(ctx: Context<Admin>, treasury: Pubkey) -> Result<()> {
    ctx.accounts.config.treasury = treasury;
    emit!(TreasuryChanged { address: treasury });
    Ok(())
}

pub fn add_minter(ctx: Context<Admin>, minter: Pubkey) -> Result<()> {
    ctx.accounts.config.minters.push(minter);
    emit!(MinterAdded { minter });
    Ok(())
}

pub fn remove_minter(ctx: Context<Admin>, minter: Pubkey) -> Result<()> {
    let mut found = false;
    let mut index = 0;
    for (i, m) in ctx.accounts.config.minters.iter().enumerate() {
        if *m == minter {
            found = true;
            index = i;
        }
    }

    if found {
        ctx.accounts.config.minters.swap_remove(index);
        emit!(MinterRemoved { minter });
    }
    Ok(())
}

pub fn add_claimer(ctx: Context<Admin>, claimer: Pubkey) -> Result<()> {
    ctx.accounts.config.claimers.push(claimer);
    emit!(ClaimerAdded { claimer });
    Ok(())
}

pub fn remove_claimer(ctx: Context<Admin>, claimer: Pubkey) -> Result<()> {
    let mut found = false;
    let mut index = 0;
    for (i, c) in ctx.accounts.config.claimers.iter().enumerate() {
        if *c == claimer {
            found = true;
            index = i;
        }
    }

    if found {
        ctx.accounts.config.claimers.swap_remove(index);
        emit!(ClaimerRemoved { claimer });
    }
    Ok(())
}

pub fn add_pauser(ctx: Context<Admin>, pauser: Pubkey) -> Result<()> {
    ctx.accounts.config.pausers.push(pauser);
    emit!(PauserAdded { pauser });
    Ok(())
}

pub fn remove_pauser(ctx: Context<Admin>, pauser: Pubkey) -> Result<()> {
    let mut found = false;
    let mut index = 0;
    for (i, p) in ctx.accounts.config.pausers.iter().enumerate() {
        if *p == pauser {
            found = true;
            index = i;
        }
    }

    if found {
        ctx.accounts.config.pausers.swap_remove(index);
        emit!(PauserRemoved { pauser });
    }
    Ok(())
}

pub fn unpause(ctx: Context<Admin>) -> Result<()> {
    require!(ctx.accounts.config.paused, LBTCError::NotPaused);
    ctx.accounts.config.paused = false;
    emit!(PauseEnabled { enabled: false });
    Ok(())
}

pub fn set_bascule(ctx: Context<Admin>, bascule: Pubkey) -> Result<()> {
    ctx.accounts.config.bascule = bascule;
    emit!(BasculeChanged { address: bascule });
    Ok(())
}
