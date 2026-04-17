use anchor_lang::prelude::*;

#[error_code]
pub enum MockCcipOfframpError {
    #[msg("The signer is unauthorized")]
    Unauthorized = 3000,
}
