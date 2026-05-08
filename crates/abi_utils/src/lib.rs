/// Decodes a u64 from an Ethereum ABI-encoded 32-byte word (big-endian, right-aligned).
/// Returns `None` if any leading 24 bytes are non-zero, meaning the value overflows u64.
pub fn u64_from_abi_word(word: &[u8; 32]) -> Option<u64> {
    word[..24]
        .iter()
        .all(|&b| b == 0)
        .then(|| u64::from_be_bytes(word[24..].try_into().unwrap()))
}

/// Decodes a u128 from an Ethereum ABI-encoded 32-byte word (big-endian, right-aligned).
/// Returns `None` if any leading 16 bytes are non-zero, meaning the value overflows u128.
pub fn u128_from_abi_word(word: &[u8; 32]) -> Option<u128> {
    word[..16]
        .iter()
        .all(|&b| b == 0)
        .then(|| u128::from_be_bytes(word[16..].try_into().unwrap()))
}

/// Decodes a u32 from an Ethereum ABI-encoded 32-byte word (big-endian, right-aligned).
/// Returns `None` if any leading 28 bytes are non-zero, meaning the value overflows u32.
pub fn u32_from_abi_word(word: &[u8; 32]) -> Option<u32> {
    word[..28]
        .iter()
        .all(|&b| b == 0)
        .then(|| u32::from_be_bytes(word[28..].try_into().unwrap()))
}

/// Encodes a u64 as an Ethereum ABI 32-byte word (big-endian, right-aligned, zero-padded).
pub fn u64_to_abi_word(v: u64) -> [u8; 32] {
    let mut word = [0u8; 32];
    word[24..].copy_from_slice(&v.to_be_bytes());
    word
}

/// Encodes a u128 as an Ethereum ABI 32-byte word (big-endian, right-aligned, zero-padded).
pub fn u128_to_abi_word(v: u128) -> [u8; 32] {
    let mut word = [0u8; 32];
    word[16..].copy_from_slice(&v.to_be_bytes());
    word
}

/// Encodes a u32 as an Ethereum ABI 32-byte word (big-endian, right-aligned, zero-padded).
pub fn u32_to_abi_word(v: u32) -> [u8; 32] {
    let mut word = [0u8; 32];
    word[28..].copy_from_slice(&v.to_be_bytes());
    word
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn u64_roundtrip() {
        let v = 0x0102030405060708_u64;
        assert_eq!(u64_from_abi_word(&u64_to_abi_word(v)), Some(v));
    }

    #[test]
    fn u64_overflow_rejected() {
        let mut word = [0u8; 32];
        word[23] = 1; // non-zero leading byte
        assert_eq!(u64_from_abi_word(&word), None);
    }

    #[test]
    fn u128_roundtrip() {
        let v = u128::MAX;
        assert_eq!(u128_from_abi_word(&u128_to_abi_word(v)), Some(v));
    }

    #[test]
    fn u128_overflow_rejected() {
        let mut word = [0u8; 32];
        word[15] = 1;
        assert_eq!(u128_from_abi_word(&word), None);
    }

    #[test]
    fn u32_roundtrip() {
        let v = u32::MAX;
        assert_eq!(u32_from_abi_word(&u32_to_abi_word(v)), Some(v));
    }

    #[test]
    fn u32_overflow_rejected() {
        let mut word = [0u8; 32];
        word[27] = 1;
        assert_eq!(u32_from_abi_word(&word), None);
    }

    #[test]
    fn zero_is_valid() {
        assert_eq!(u64_from_abi_word(&[0u8; 32]), Some(0));
        assert_eq!(u128_from_abi_word(&[0u8; 32]), Some(0));
        assert_eq!(u32_from_abi_word(&[0u8; 32]), Some(0));
    }
}
