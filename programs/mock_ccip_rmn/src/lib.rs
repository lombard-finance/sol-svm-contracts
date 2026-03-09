use anchor_lang::prelude::*;

pub mod constants;
pub mod errors;
pub mod instructions;
pub mod state;

use instructions::*;

use crate::state::CurseSubject;

declare_id!("sCUWcED3Evwk7BPgUCq13YAwK6jViCwy7RwA2UV7Lk1");

#[program]
pub mod mock_ccip_rmn {

    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        instructions::initialize(ctx)
    }

    pub fn verify_not_cursed(ctx: Context<InspectCurses>, subject: CurseSubject) -> Result<()> {
        instructions::verify_not_cursed(ctx, subject)
    }
}
