pub const GMP_RECEIVE_DISCRIMINATOR: [u8; 8] = [0x4b, 0x48, 0xdb, 0xe6, 0x55, 0x03, 0x18, 0x2c];

/// The data for the GMP receive instruction issued by the mailbox program to the recipient
/// program when a message is handled.
/// According to Anchor, data to select an instruction to call is encoded as:
/// discriminator||instruction_data where || is the concatenation operator.
///
/// The discriminator is a 8 byte array that identifies the instruction to call computed
/// as the first 8 bytes of the hash of the name of the instruction to call.
///
/// Then, data follows the discriminator, which is the payload hash of the message to handle.
pub fn gmp_receive_instr_data(payload_hash: [u8; 32]) -> Vec<u8> {
    let mut data = Vec::new();
    data.extend_from_slice(&GMP_RECEIVE_DISCRIMINATOR);
    data.extend_from_slice(&payload_hash);
    data
}
