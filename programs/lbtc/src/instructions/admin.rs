//! Collection of admin-privileged functionality.
use crate::{
    constants,
    errors::LBTCError,
    events::{
        BasculeEnabled, BurnCommissionSet, ClaimerAdded, ClaimerRemoved, DustFeeRateSet,
        OperatorSet, OwnershipTransferInitiated, PauserAdded, PauserRemoved, WithdrawalsEnabled,
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

pub fn transfer_ownership(ctx: Context<Admin>, new_admin: Pubkey) -> Result<()> {
    ctx.accounts.config.pending_admin = new_admin;
    emit!(OwnershipTransferInitiated { new_admin });
    Ok(())
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
    require!(commission <= constants::MAX_FEE, LBTCError::FeeTooHigh);
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

pub fn add_claimer(ctx: Context<Admin>, claimer: Pubkey) -> Result<()> {
    require!(
        !ctx.accounts.config.claimers.iter().any(|c| *c == claimer),
        LBTCError::ClaimerExists
    );
    ctx.accounts.config.claimers.push(claimer);
    emit!(ClaimerAdded { claimer });
    Ok(())
}

pub fn remove_claimer(ctx: Context<Admin>, claimer: Pubkey) -> Result<()> {
    require!(
        remove_from_vector(&mut ctx.accounts.config.claimers, claimer),
        LBTCError::ClaimerNotFound
    );
    emit!(ClaimerRemoved { claimer });
    Ok(())
}

pub fn add_pauser(ctx: Context<Admin>, pauser: Pubkey) -> Result<()> {
    require!(
        !ctx.accounts.config.pausers.iter().any(|p| *p == pauser),
        LBTCError::PauserExists
    );
    ctx.accounts.config.pausers.push(pauser);
    emit!(PauserAdded { pauser });
    Ok(())
}

pub fn remove_pauser(ctx: Context<Admin>, pauser: Pubkey) -> Result<()> {
    require!(
        remove_from_vector(&mut ctx.accounts.config.pausers, pauser),
        LBTCError::PauserNotFound
    );
    emit!(PauserRemoved { pauser });
    Ok(())
}

fn remove_from_vector(v: &mut Vec<Pubkey>, to_remove: Pubkey) -> bool {
    let mut found = false;
    let mut index = 0;
    for (i, p) in v.iter().enumerate() {
        if *p == to_remove {
            found = true;
            index = i;
            break;
        }
    }

    if found {
        v.swap_remove(index);
    }

    found
}
