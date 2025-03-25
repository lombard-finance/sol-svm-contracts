//! This module implements the dust limit calculation for the supported output types in the Lombard
//! protocol.
use crate::errors::LBTCError;
use anchor_lang::prelude::*;

// Magic values in bitcoin script.
const OP_0: u8 = 0x00;
const OP_1: u8 = 0x51;
const OP_DATA_32: u8 = 0x20;
const OP_DATA_20: u8 = 0x14;

const BASE_SPEND_COST: u64 = 41; // 32 (txid) + 4 (vout) + 1 (scriptSig size) + 4 (nSequence)
const WITNESS_INPUT_SIZE: u64 = 26; // floor(107 / 4), used for witness outputs (P2WPKH, P2WSH, P2TR)

pub const P2WPKH_LEN: usize = 22;
pub const P2TR_P2WSH_LEN: usize = 34;

/// The supported output types for the Lombard protocol.
pub enum OutputType {
    P2WPKH,
    P2TR,
    P2WSH,
}

/// Compute the dust limit for an output depending on its script pubkey type.
pub fn get_dust_limit_for_output(script_pubkey: &[u8], dust_fee_rate: u64) -> Result<u64> {
    let script_pubkey_len = script_pubkey.len();
    // Validate correct output type, but we can drop the actual result.
    let _ = get_output_type(script_pubkey)?;
    let spend_cost = BASE_SPEND_COST + WITNESS_INPUT_SIZE + serialize_size(script_pubkey_len);
    Ok((spend_cost * dust_fee_rate).div_ceil(1000))
}

fn get_output_type(script_pubkey: &[u8]) -> Result<OutputType> {
    match script_pubkey.len() {
        P2WPKH_LEN => {
            if script_pubkey[0] == OP_0 && script_pubkey[1] == OP_DATA_20 {
                Ok(OutputType::P2WPKH)
            } else {
                err!(LBTCError::UnsupportedRedeemAddress)
            }
        }
        P2TR_P2WSH_LEN => {
            if script_pubkey[0] == OP_1 && script_pubkey[1] == OP_DATA_32 {
                Ok(OutputType::P2TR)
            } else if script_pubkey[0] == OP_0 && script_pubkey[1] == OP_DATA_32 {
                Ok(OutputType::P2WSH)
            } else {
                err!(LBTCError::UnsupportedRedeemAddress)
            }
        }
        _ => err!(LBTCError::UnsupportedRedeemAddress),
    }
}

fn serialize_size(script_pubkey_len: usize) -> u64 {
    8 + var_int_serialize_size(script_pubkey_len) + script_pubkey_len as u64
}

fn var_int_serialize_size(val: usize) -> u64 {
    if val < 0xfd {
        1
    } else if val <= 0xffff {
        3
    } else if val <= 0xffff_ffff {
        5
    } else {
        9
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // https://github.com/bitcoin/bitcoin/blob/43740f4971f45cd5499470b6a085b3ecd8b96d28/src/policy/policy.cpp#L41
    // dictates that p2wpkh should have a dust limit of 294 satoshis at a default rate of
    // 3000 sat/kvB.
    #[test]
    fn test_p2wpkh_size() {
        let pubkey = vec![
            OP_0, OP_DATA_20, 12u8, 12u8, 12u8, 12u8, 12u8, 12u8, 12u8, 12u8, 12u8, 12u8, 12u8,
            12u8, 12u8, 12u8, 12u8, 12u8, 12u8, 12u8, 12u8, 12u8,
        ];
        let dust_limit = get_dust_limit_for_output(&pubkey, 3000).unwrap();
        assert_eq!(dust_limit, 294);
    }

    // https://bitcoin.stackexchange.com/questions/95580/is-the-dust-output-limit-the-same-for-p2wpkh-and-p2wsh
    // dictates that p2wsh should have a dust limit of 330 satoshis at a default rate of
    // 3000 sat/kvB.
    #[test]
    fn test_p2wsh_size() {
        let pubkey = vec![
            OP_0, OP_DATA_32, 12u8, 12u8, 12u8, 12u8, 12u8, 12u8, 12u8, 12u8, 12u8, 12u8, 12u8,
            12u8, 12u8, 12u8, 12u8, 12u8, 12u8, 12u8, 12u8, 12u8, 12u8, 12u8, 12u8, 12u8, 12u8,
            12u8, 12u8, 12u8, 12u8, 12u8, 12u8, 12u8,
        ];
        let dust_limit = get_dust_limit_for_output(&pubkey, 3000).unwrap();
        assert_eq!(dust_limit, 330);
    }

    // Since p2wsh and p2tr are the same size, it should also have a dust limit of 330.
    #[test]
    fn test_p2tr_size() {
        let pubkey = vec![
            OP_1, OP_DATA_32, 12u8, 12u8, 12u8, 12u8, 12u8, 12u8, 12u8, 12u8, 12u8, 12u8, 12u8,
            12u8, 12u8, 12u8, 12u8, 12u8, 12u8, 12u8, 12u8, 12u8, 12u8, 12u8, 12u8, 12u8, 12u8,
            12u8, 12u8, 12u8, 12u8, 12u8, 12u8, 12u8,
        ];
        let dust_limit = get_dust_limit_for_output(&pubkey, 3000).unwrap();
        assert_eq!(dust_limit, 330);
    }
}
