use anchor_lang::prelude::*;

#[error_code]
pub enum BasculeGmpError {
    #[msg("Unauthorized function call")]
    Unauthorized,
    #[msg("Account role already granted")]
    AccountRoleAlreadyGranted,
    #[msg("Program is paused")]
    Paused,
    #[msg("Mint payload already in Minted state")]
    AlreadyMinted,
    #[msg("Mint payload must be in Reported state when amount >= validate threshold")]
    MustBeReportedWhenAboveThreshold,
    #[msg("Mint payload account does not exist")]
    MintPayloadNotFound,
    #[msg("Invalid proof: signature of mint message id does not match trusted signer")]
    InvalidProof,
    #[msg("Invalid chain id")]
    InvalidChainId,
}
