use anchor_lang::prelude::*;

pub mod constants;
pub mod events;
pub mod instructions;
use instructions::*;

declare_id!("Eah44rnwyrwhcMgSrLXUzU1VeyMzSfsYb5SXJYg7oX2K");

#[program]
pub mod registry {

    use super::*;

    pub fn post_message(ctx: Context<PostMessage>, message: Vec<u8>, nonce: u32) -> Result<()> {
        instructions::post_message(ctx, message, nonce)
    }

}
