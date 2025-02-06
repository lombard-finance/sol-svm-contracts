use crate::{errors::LBTCError, Config};
use anchor_lang::prelude::*;

pub fn check_signatures(config: Account<'_, Config>, signatures: Vec<[u8; 64]>) -> Result<bool> {
    Ok(false)
}
