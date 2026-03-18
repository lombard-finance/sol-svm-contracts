use anchor_lang::prelude::*;

#[error_code]
pub enum MockCcipRmnError {
    #[msg("The signer is unauthorized")]
    Unauthorized = 3000,
    #[msg("Invalid version of the onchain state")]
    InvalidVersion,    
}
