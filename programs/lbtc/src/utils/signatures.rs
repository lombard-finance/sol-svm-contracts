//! This module implements the validation of Lombard Ledger Consortium signatures.
use crate::constants::VALIDATOR_PUBKEY_SIZE;
use solana_program::secp256k1_recover::secp256k1_recover;

// Simply performs public key recovery on a signature and hash, and checks if it matches the given
// validator.
pub fn check_signature(
    validator: &[u8; VALIDATOR_PUBKEY_SIZE],
    signature: &[u8; 64],
    payload_hash: &[u8; 32],
) -> bool {
    // Check first with v = 27.
    let pubkey = match secp256k1_recover(payload_hash, 0, signature) {
        Ok(pubkey) => pubkey.to_bytes(),
        Err(_) => return false,
    };

    if pubkey == *validator {
        true
    } else {
        // If it fails, check with v = 28.
        let pubkey = match secp256k1_recover(payload_hash, 1, signature) {
            Ok(pubkey) => pubkey.to_bytes(),
            Err(_) => return false,
        };
        pubkey == *validator
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_valid_signature() {
        let signature =
            hex::decode("5ac3b079f374485585c941449e67e4fd33217c4a5579dc61f9d7b2704a00820c29d588f2981f7a2a429cf2df97ed1ead40f37d1c4fc45257ee37592861b49570")
                .unwrap();
        let validator: [u8; VALIDATOR_PUBKEY_SIZE] =
            hex::decode("ba5734d8f7091719471e7f7ed6b9df170dc70cc661ca05e688601ad984f068b0d67351e5f06073092499336ab0839ef8a521afd334e53807205fa2f08eec74f4")
                .unwrap()
                .try_into()
                .unwrap();
        let payload_hash =
            hex::decode("89cf3b8247cc333fcf84109cee811a81d2ed1c14af1701b7716cbb0611e51979")
                .unwrap();

        assert!(check_signature(
            &validator,
            &signature.try_into().unwrap(),
            &payload_hash.try_into().unwrap()
        ));
    }

    #[test]
    fn test_invalid_signature() {
        let signature =
            hex::decode("5ac3b079f374485585c941449e67e4fd33217c4a5579dc61f9d7b2704a00820c29d588f2981f7a2a429cf2df97ed1ead40f37d1c4fc45257ee37592861b49570")
                .unwrap();
        let validator: [u8; VALIDATOR_PUBKEY_SIZE] =
            hex::decode("ba57a4d8f7091719471e7f7ed6b9df170dc70cc661ca05e688601ad984f068b0d67351e5f06073092499336ab0839ef8a521afd334e53807205fa2f08eec74f4")
                .unwrap()
                .try_into()
                .unwrap();
        let payload_hash =
            hex::decode("89cf3b8247cc333fcf84109cee811a81d2ed1c14af1701b7716cbb0611e51979")
                .unwrap();

        assert!(!check_signature(
            &validator,
            &signature.try_into().unwrap(),
            &payload_hash.try_into().unwrap(),
        ));
    }
}
