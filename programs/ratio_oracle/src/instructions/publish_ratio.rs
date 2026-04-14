use anchor_lang::prelude::*;
use anchor_lang::solana_program::hash::hash as sha256;

use consortium::constants::VALIDATED_PAYLOAD_SEED;
use consortium::state::ValidatedPayload;

use crate::{
    constants::{self, DEFAULT_SWITCH_INTERVAL, MAX_RATIO_THRESHOLD},
    errors::RatioOracleError,
    state::{Config, Oracle},
    utils::consortium_payloads::{RatioUpdate, RATIO_UPDATE_PAYLOAD_LEN},
};

#[derive(Accounts)]
#[instruction(payload: [u8; RATIO_UPDATE_PAYLOAD_LEN])]
pub struct PublishRatio<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(seeds = [constants::CONFIG_SEED], bump)]
    pub config: Account<'info, Config>,
    // do not need to check seeds for the oracle account since it is enough to check that the update
    // payload refers to this account
    #[account(mut)]
    pub oracle: Account<'info, Oracle>,
    /// check that the consortium program has validated the payload
    #[account(
        owner = config.consortium,
        seeds = [VALIDATED_PAYLOAD_SEED, &sha256(&payload).to_bytes()[..]],
        seeds::program = config.consortium,
        bump
    )]
    pub consortium_validated_payload: Account<'info, ValidatedPayload>,
}

pub fn publish_ratio(
    ctx: Context<PublishRatio>,
    payload: [u8; RATIO_UPDATE_PAYLOAD_LEN],
) -> Result<()> {
    let ratio_update = RatioUpdate::from_session_payload(&payload)?;
    let computed_denom_hash = sha256(ctx.accounts.oracle.denom.as_bytes()).to_bytes();

    require!(
        ratio_update.denom_hash == computed_denom_hash,
        RatioOracleError::WrongDenom
    );

    let oracle = &mut ctx.accounts.oracle;

    // check switch time is not in the past or too far in the future
    require!(
        ratio_update.timestamp > oracle.switch_time,
        RatioOracleError::OutdatedRatioUpdate
    );
    let now = Clock::get()?.unix_timestamp as u64;
    require!(
        ratio_update.timestamp <= now + oracle.max_ahead_interval,
        RatioOracleError::MaxAheadIntervalExceeded
    );

    let interval = ratio_update.timestamp - oracle.switch_time;
    // check new ratio is within the threshold
    let threshold = oracle.current_ratio * interval as u128 * oracle.ratio_threshold
        / (MAX_RATIO_THRESHOLD * DEFAULT_SWITCH_INTERVAL as u128);
    match oracle.current_ratio > ratio_update.ratio {
        true => {
            require!(
                oracle.current_ratio - ratio_update.ratio <= threshold,
                RatioOracleError::RatioThresholdExceeded
            );
        }
        false => {
            require!(
                ratio_update.ratio - oracle.current_ratio <= threshold,
                RatioOracleError::RatioThresholdExceeded
            );
        }
    }

    // based on the switch time we use the previous ratio
    if now >= oracle.switch_time {
        oracle.previous_ratio = Some(oracle.current_ratio);
    }

    oracle.current_ratio = ratio_update.ratio;
    oracle.switch_time = ratio_update.timestamp;
    Ok(())
}
