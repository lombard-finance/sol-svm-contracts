//! This module implements the validation of Lombard Ledger Consortium signatures.
use crate::errors::LBTCError;
use anchor_lang::prelude::*;
use solana_program::secp256k1_recover::secp256k1_recover;

/// Checks the given signatures against the currently set consortium, and ensures that the
/// cumulative weight meets the set weight threshold.
pub fn check_signatures(
    epoch: u64,
    validators: &[[u8; 64]],
    weights: &[u64],
    weight_threshold: u64,
    signatures: Vec<[u8; 64]>,
    payload_hash: [u8; 32],
) -> Result<()> {
    require!(
        signatures.len() == validators.len(),
        LBTCError::SignatureLengthMismatch,
    );
    require!(epoch != 0, LBTCError::NoValidatorSet);

    let mut weight = 0;
    for (i, signature) in signatures.iter().enumerate() {
        if check_signature(validators, signature, &payload_hash, i) {
            weight += weights[i];
        }
    }

    require!(weight >= weight_threshold, LBTCError::NotEnoughSignatures);
    Ok(())
}

pub fn check_signature(
    validators: &[[u8; 64]],
    signature: &[u8; 64],
    payload_hash: &[u8; 32],
    index: usize,
) -> bool {
    // Check first with v = 27.
    let pubkey = match secp256k1_recover(payload_hash, 0, signature) {
        Ok(pubkey) => pubkey.to_bytes(),
        Err(_) => return false,
    };

    if pubkey == validators[index] {
        true
    } else {
        // If it fails, check with v = 28.
        let pubkey = match secp256k1_recover(payload_hash, 1, signature) {
            Ok(pubkey) => pubkey.to_bytes(),
            Err(_) => return false,
        };
        pubkey == validators[index]
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::decoder::decode_signatures;

    #[test]
    fn test_valid_signatures() {
        let signatures_payload = hex::decode("00000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000003000000000000000000000000000000000000000000000000000000000000006000000000000000000000000000000000000000000000000000000000000000c0000000000000000000000000000000000000000000000000000000000000012000000000000000000000000000000000000000000000000000000000000000405ac3b079f374485585c941449e67e4fd33217c4a5579dc61f9d7b2704a00820c29d588f2981f7a2a429cf2df97ed1ead40f37d1c4fc45257ee37592861b4957000000000000000000000000000000000000000000000000000000000000000404588a44b8309f6602515e4aa5e6868b4b8131bea1a3d7e137049113b31c2ea384a3cea2e1ce7ecdd30cf6caabd22282dc65324de0c14e857c4850c981935a0260000000000000000000000000000000000000000000000000000000000000040b31e60fd4802a7d476dc9a75b280182c718ffd8a0ddf4630b4a91b4450a2c3ca5f9f34229c2c9da7a86881fefe7f41ffcafd96b6157da2729f59c4856e2d437a").unwrap();
        let validators: [[u8; 64]; 3] = [
            hex::decode("ba5734d8f7091719471e7f7ed6b9df170dc70cc661ca05e688601ad984f068b0d67351e5f06073092499336ab0839ef8a521afd334e53807205fa2f08eec74f4").unwrap().try_into().unwrap(), 
            hex::decode("9d9031e97dd78ff8c15aa86939de9b1e791066a0224e331bc962a2099a7b1f0464b8bbafe1535f2301c72c2cb3535b172da30b02686ab0393d348614f157fbdb").unwrap().try_into().unwrap(), 
            hex::decode("20b871f3ced029e14472ec4ebc3c0448164942b123aa6af91a3386c1c403e0ebd3b4a5752a2b6c49e574619e6aa0549eb9ccd036b9bbc507e1f7f9712a236092").unwrap().try_into().unwrap()
        ];
        let weights: [u64; 3] = [1, 1, 1];
        let weight_threshold = 3;

        let signatures = decode_signatures(&signatures_payload).unwrap();
        let payload_hash =
            hex::decode("89cf3b8247cc333fcf84109cee811a81d2ed1c14af1701b7716cbb0611e51979")
                .unwrap();
        check_signatures(
            1,
            &validators,
            &weights,
            weight_threshold,
            signatures,
            payload_hash.try_into().unwrap(),
        )
        .unwrap();
    }

    #[test]
    fn test_2_of_3_signatures() {
        let signatures_payload = hex::decode("00000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000003000000000000000000000000000000000000000000000000000000000000006000000000000000000000000000000000000000000000000000000000000000c0000000000000000000000000000000000000000000000000000000000000012000000000000000000000000000000000000000000000000000000000000000405ac3b079f374485585c941449e67e4fd33217c4a5579dc61f9d7b2704a00820c29d588f2981f7a2a429cf2df97ed1ead40f37d1c4fc45257ee37592861b4957000000000000000000000000000000000000000000000000000000000000000404588a44b8309f6602515e4aa5e6868b4b8131bea1a3d7e137049113b31c2ea384a3cea2e1ce7ecdd30cf6caabd22282dc65324de0c14e857c4850c981935a0260000000000000000000000000000000000000000000000000000000000000040b31e60fd4802a7d476dc9a75b280182c718ffd8a0ddf4630b4a91b4450a2c3ca5f9f34229c2c9da7a86881fefe7f41ffcafd96b6157da2729f59c4856e2d437a").unwrap();
        // Muddle with one of the validator keys
        let validators: [[u8; 64]; 3] = [
            hex::decode("ba57f4d8f7091719471e7f7ed6b9df170dc70cc661ca05e688601ad984f068b0d67351e5f06073092499336ab0839ef8a521afd334e53807205fa2f08eec74f4").unwrap().try_into().unwrap(), 
            hex::decode("9d9031e97dd78ff8c15aa86939de9b1e791066a0224e331bc962a2099a7b1f0464b8bbafe1535f2301c72c2cb3535b172da30b02686ab0393d348614f157fbdb").unwrap().try_into().unwrap(), 
            hex::decode("20b871f3ced029e14472ec4ebc3c0448164942b123aa6af91a3386c1c403e0ebd3b4a5752a2b6c49e574619e6aa0549eb9ccd036b9bbc507e1f7f9712a236092").unwrap().try_into().unwrap()
        ];
        let weights: [u64; 3] = [1, 1, 1];
        let weight_threshold = 2;

        let signatures = decode_signatures(&signatures_payload).unwrap();
        let payload_hash =
            hex::decode("89cf3b8247cc333fcf84109cee811a81d2ed1c14af1701b7716cbb0611e51979")
                .unwrap();
        check_signatures(
            1,
            &validators,
            &weights,
            weight_threshold,
            signatures,
            payload_hash.try_into().unwrap(),
        )
        .unwrap();
    }

    #[test]
    #[should_panic]
    fn test_invalid_signatures() {
        let signatures_payload = hex::decode("00000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000003000000000000000000000000000000000000000000000000000000000000006000000000000000000000000000000000000000000000000000000000000000c0000000000000000000000000000000000000000000000000000000000000012000000000000000000000000000000000000000000000000000000000000000405ac3b079f374485585c941449e67e4fd33217c4a5579dc61f9d7b2704a00820c29d588f2981f7a2a429cf2df97ed1ead40f37d1c4fc45257ee37592861b4957000000000000000000000000000000000000000000000000000000000000000404588a44b8309f6602515e4aa5e6868b4b8131bea1a3d7e137049113b31c2ea384a3cea2e1ce7ecdd30cf6caabd22282dc65324de0c14e857c4850c981935a0260000000000000000000000000000000000000000000000000000000000000040b31e60fd4802a7d476dc9a75b280182c718ffd8a0ddf4630b4a91b4450a2c3ca5f9f34229c2c9da7a86881fefe7f41ffcafd96b6157da2729f59c4856e2d437a").unwrap();
        // Muddle with one of the validator keys
        let validators: [[u8; 64]; 3] = [
            hex::decode("ba57f4d8f7091719471e7f7ed6b9df170dc70cc661ca05e688601ad984f068b0d67351e5f06073092499336ab0839ef8a521afd334e53807205fa2f08eec74f4").unwrap().try_into().unwrap(), 
            hex::decode("9d9031e97dd78ff8c15aa86939de9b1e791066a0224e331bc962a2099a7b1f0464b8bbafe1535f2301c72c2cb3535b172da30b02686ab0393d348614f157fbdb").unwrap().try_into().unwrap(), 
            hex::decode("20b871f3ced029e14472ec4ebc3c0448164942b123aa6af91a3386c1c403e0ebd3b4a5752a2b6c49e574619e6aa0549eb9ccd036b9bbc507e1f7f9712a236092").unwrap().try_into().unwrap()
        ];
        let weights: [u64; 3] = [1, 1, 1];
        let weight_threshold = 3;

        let signatures = decode_signatures(&signatures_payload).unwrap();
        let payload_hash =
            hex::decode("89cf3b8247cc333fcf84109cee811a81d2ed1c14af1701b7716cbb0611e51979")
                .unwrap();
        check_signatures(
            1,
            &validators,
            &weights,
            weight_threshold,
            signatures,
            payload_hash.try_into().unwrap(),
        )
        .unwrap();
    }
}
