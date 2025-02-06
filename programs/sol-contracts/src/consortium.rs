use crate::{errors::LBTCError, Config};
use anchor_lang::prelude::*;
use solana_program::secp256k1_recover::secp256k1_recover;

pub fn check_signatures(
    config: Account<'_, Config>,
    signatures: Vec<[u8; 64]>,
    payload_hash: [u8; 32],
) -> Result<()> {
    require!(
        signatures.len() == config.validators.len(),
        LBTCError::SignatureLengthMismatch,
    );
    require!(config.epoch != 0, LBTCError::NoValidatorSet);

    let mut weight = 0;
    for (i, signature) in signatures.iter().enumerate() {
        // Check first with v = 27.
        let pubkey = match secp256k1_recover(&payload_hash, 0, signature) {
            Ok(pubkey) => pubkey.to_bytes(),
            Err(_) => continue,
        };

        if pubkey != config.validators[i] {
            // If it fails, check with v = 28.
            let pubkey = match secp256k1_recover(&payload_hash, 1, signature) {
                Ok(pubkey) => pubkey.to_bytes(),
                Err(_) => continue,
            };
            if pubkey != config.validators[i] {
                continue;
            }
        }

        weight += config.weights[i];
    }

    require!(
        weight >= config.weight_threshold,
        LBTCError::NotEnoughSignatures
    );
    Ok(())
}
