use anchor_lang::prelude::*;

#[event]
pub struct MockCcipOnrampCompleted {
    pub bridge_data: Vec<u8>,
}
