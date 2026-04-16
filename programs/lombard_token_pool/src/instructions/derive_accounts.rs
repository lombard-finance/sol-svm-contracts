use std::io::{BufReader, Cursor, Read};
use anchor_lang::prelude::*;

use anchor_lang::solana_program::hash::hash  as sha256;
use base_token_pool::common::{
    CcipAccountMeta, CcipTokenPoolError, DeriveAccountsResponse, LockOrBurnInV1, ReleaseOrMintInV1,
    ToMeta, POOL_CHAINCONFIG_SEED, POOL_STATE_SEED,
};
use core::fmt;
use std::{
    fmt::{Display, Formatter},
    str::FromStr,
};

use mailbox::{
    self,
    state::Config,
};

use crate::{
    context::{BRIDGE_PROGRAM, get_pda, Empty, MAILBOX_PROGRAM}, 
    errors::LombardTokenPoolError,
    state::{ChainConfig, State},
};

// Local helper to find a readonly CCIP meta for a given seed + program_id combo.
// Short name for compactness.
fn find(seeds: &[&[u8]], program_id: Pubkey) -> CcipAccountMeta {
    Pubkey::find_program_address(seeds, &program_id)
        .0
        .readonly()
}

pub mod release_or_mint {

    use super::*;

    #[derive(Clone, Debug)]
    pub enum OfframpDeriveStage {
        RetrieveStateConfig,
        RetrieveChainConfig,
        BuildDynamicAccounts,
    }

    impl Display for OfframpDeriveStage {
        fn fmt(&self, f: &mut Formatter) -> fmt::Result {
            match self {
                OfframpDeriveStage::RetrieveStateConfig => f.write_str("RetrieveStateConfig"),
                OfframpDeriveStage::RetrieveChainConfig => f.write_str("RetrieveChainConfig"),
                OfframpDeriveStage::BuildDynamicAccounts => f.write_str("BuildDynamicAccounts"),
            }
        }
    }

    impl FromStr for OfframpDeriveStage {
        type Err = CcipTokenPoolError;

        fn from_str(s: &str) -> std::result::Result<Self, Self::Err> {
            match s {
                "Start" | "RetrieveStateConfig" => Ok(Self::RetrieveStateConfig),
                "RetrieveChainConfig" => Ok(Self::RetrieveChainConfig),
                "BuildDynamicAccounts" => Ok(Self::BuildDynamicAccounts),
                _ => Err(CcipTokenPoolError::InvalidDerivationStage),
            }
        }
    }

    pub fn retrieve_state_config(
        release_or_mint: &ReleaseOrMintInV1,
    ) -> Result<DeriveAccountsResponse> {
        let mint = release_or_mint.local_token;
        Ok(DeriveAccountsResponse {
            ask_again_with: vec![find(
                &[
                    POOL_STATE_SEED, mint.as_ref()
                ],
                crate::ID,
            )],
            // We don't need the domain for the first few PDAs, so we return them now to keep
            // return sizes balanced.
            accounts_to_save: vec![],
            current_stage: OfframpDeriveStage::RetrieveStateConfig.to_string(),
            next_stage: OfframpDeriveStage::RetrieveChainConfig.to_string(),
            ..Default::default()
        })
    }

    pub fn retrieve_chain_config<'info>(
        ctx: Context<'_, '_, 'info, 'info, Empty>,
        release_or_mint: &ReleaseOrMintInV1,
    ) -> Result<DeriveAccountsResponse> {
        let state = Account::<'info, State>::try_from(&ctx.remaining_accounts[0])?;
        Ok(DeriveAccountsResponse {
            ask_again_with: vec![find(
                &[
                    POOL_CHAINCONFIG_SEED,
                    &release_or_mint.remote_chain_selector.to_le_bytes(),
                    release_or_mint.local_token.as_ref(),
                ],
                crate::ID,
            )],
            // We don't need the domain for the first few PDAs, so we return them now to keep
            // return sizes balanced.
            accounts_to_save: vec![],
            look_up_tables_to_save: match state.config.alt {
                Some(alt) => vec![alt],
                None => vec![]
            },
            current_stage: OfframpDeriveStage::RetrieveChainConfig.to_string(),
            next_stage: OfframpDeriveStage::BuildDynamicAccounts.to_string(),
            ..Default::default()
        })
    }

    pub fn build_dynamic_accounts<'info>(
        ctx: Context<'_, '_, 'info, 'info, Empty>,
        release_or_mint: &ReleaseOrMintInV1,
    ) -> Result<DeriveAccountsResponse> {
        let chain_config = Account::<'info, ChainConfig>::try_from(&ctx.remaining_accounts[0])?;
        let chain_id = chain_config.bridge.destination_chain_id;
        let mint = release_or_mint.local_token;
        let payload = payload_from_offchain_data(&release_or_mint.offchain_token_data)?;
        let payload_hash = sha256(&payload).to_bytes();

        Ok(DeriveAccountsResponse {
            accounts_to_save: vec![
                // remote_bridge_config
                get_pda(&[b"remote_bridge_config", chain_id.as_ref()], &BRIDGE_PROGRAM)
                    .readonly(),
                // remote_token_config
                get_pda(&[b"remote_token_config", mint.as_ref(), chain_id.as_ref()], &BRIDGE_PROGRAM)
                    .writable(),
                // inbound_message_path
                get_pda(&[b"inbound_message_path", chain_id.as_ref()], &MAILBOX_PROGRAM)
                    .writable(),
                // message_info
                get_pda(&[b"message", &payload_hash], &MAILBOX_PROGRAM).writable(),
                // message_handled
                get_pda(&[b"message_handled", &payload_hash], &BRIDGE_PROGRAM).writable(),
            ],
            current_stage: OfframpDeriveStage::BuildDynamicAccounts.to_string(),
            ..Default::default()
        })
    }


    pub fn payload_from_offchain_data(bytes: &[u8]) -> Result<Vec<u8>> {
        require!(bytes.len() >= 32 * 2, LombardTokenPoolError::InvalidPayloadLength);

        let mut reader = BufReader::new(Cursor::new(bytes));

        // check selector
        let mut offset_bytes = [0u8; 32];
        reader.read_exact(&mut offset_bytes)?;
        let offset = u64::from_be_bytes(offset_bytes[24..32].try_into().unwrap());
        require!(offset >= 32, LombardTokenPoolError::InvalidPayload);
        reader.seek_relative(offset as i64 - 32)?;

        let mut length_bytes = [0u8; 32];
        reader.read_exact(&mut length_bytes)?;
        let length = u64::from_be_bytes(length_bytes[24..32].try_into().unwrap());

        let mut payload = vec![0u8; length as usize];
        reader.read_exact(&mut payload)?;

        Ok(payload)
    }
}

pub mod lock_or_burn {

    use super::*;

    #[derive(Clone, Debug)]
    pub enum OnrampDeriveStage {
        RetrieveStateConfig,
        RetrieveChainConfig,
        BuildDynamicAccounts1,
        BuildDynamicAccounts2,
    }

    impl Display for OnrampDeriveStage {
        fn fmt(&self, f: &mut Formatter) -> fmt::Result {
            match self {
                OnrampDeriveStage::RetrieveStateConfig => f.write_str("RetrieveStateConfig"),
                OnrampDeriveStage::RetrieveChainConfig => f.write_str("RetrieveChainConfig"),
                OnrampDeriveStage::BuildDynamicAccounts1 => f.write_str("BuildDynamicAccounts1"),
                OnrampDeriveStage::BuildDynamicAccounts2 => f.write_str("BuildDynamicAccounts2"),
            }
        }
    }

    impl FromStr for OnrampDeriveStage {
        type Err = CcipTokenPoolError;

        fn from_str(s: &str) -> std::result::Result<Self, Self::Err> {
            match s {
                "Start" | "RetrieveStateConfig" => Ok(Self::RetrieveStateConfig),
                "RetrieveChainConfig" => Ok(Self::RetrieveChainConfig),
                "BuildDynamicAccounts1" => Ok(Self::BuildDynamicAccounts1),
                "BuildDynamicAccounts2" => Ok(Self::BuildDynamicAccounts2),
                _ => Err(CcipTokenPoolError::InvalidDerivationStage),
            }
        }
    }

    pub fn retrieve_state_config<'info>(
        lock_or_burn: &LockOrBurnInV1
    ) -> Result<DeriveAccountsResponse> {
        let mint = lock_or_burn.local_token;
        Ok(DeriveAccountsResponse {
            ask_again_with: vec![find(
                &[
                    POOL_STATE_SEED, mint.as_ref()
                ],
                crate::ID,
            )],
            // We don't need the domain for the first few PDAs, so we return them now to keep
            // return sizes balanced.
            accounts_to_save: vec![],
            current_stage: OnrampDeriveStage::RetrieveStateConfig.to_string(),
            next_stage: OnrampDeriveStage::RetrieveChainConfig.to_string(),
            ..Default::default()
        })
    }

    pub fn retrieve_chain_config<'info>(
        ctx: Context<'_, '_, 'info, 'info, Empty>,
        lock_or_burn: &LockOrBurnInV1,
    ) -> Result<DeriveAccountsResponse> {
        let state = Account::<'info, State>::try_from(&ctx.remaining_accounts[0])?;
        Ok(DeriveAccountsResponse {
            ask_again_with: vec![
                find(
                    &[
                        POOL_CHAINCONFIG_SEED,
                        &lock_or_burn.remote_chain_selector.to_le_bytes(),
                        lock_or_burn.local_token.as_ref(),
                    ],
                    crate::ID,
                )
            ],
            // The static PDAs have mostly already been returned by CCIP via the LUT, so we just return here the ones not shared with offramp (so not in LUT)
            accounts_to_save: vec![
                // get_token_messenger_minter_pda(&[b"sender_authority"]).readonly()
            ],
            look_up_tables_to_save: match state.config.alt {
                Some(alt) => vec![alt],
                None => vec![]
            },
            current_stage: OnrampDeriveStage::RetrieveChainConfig.to_string(),
            next_stage: OnrampDeriveStage::BuildDynamicAccounts1.to_string(),
            ..Default::default()
        })
    }

    pub fn build_dynamic_accounts1<'info>(
        ctx: Context<'_, '_, 'info, 'info, Empty>,
        lock_or_burn: &LockOrBurnInV1,
    ) -> Result<DeriveAccountsResponse> {
        let chain_config = Account::<'info, ChainConfig>::try_from(&ctx.remaining_accounts[0])?;
        let chain_id = chain_config.bridge.destination_chain_id;
        let mint = lock_or_burn.local_token;
        let token_pool_signer = get_pda(&[b"ccip_tokenpool_signer", mint.as_ref()], &crate::ID);

        Ok(DeriveAccountsResponse {
            ask_again_with: vec![
                get_pda(&[b"mailbox_config"], &MAILBOX_PROGRAM).readonly(),
            ],
            // The static PDAs have mostly already been returned by CCIP via the LUT, so we just return here the ones not shared with offramp (so not in LUT)
            accounts_to_save: vec![
                // remote_bridge_config
                get_pda(&[b"remote_bridge_config", chain_id.as_ref()], &BRIDGE_PROGRAM)
                    .readonly(),
                // remote_token_config
                get_pda(&[b"remote_token_config", mint.as_ref(), chain_id.as_ref()], &BRIDGE_PROGRAM)
                    .writable(),
                // bridge_sender_config
                get_pda(&[b"sender_config", token_pool_signer.as_ref()], &BRIDGE_PROGRAM)
                    .readonly(),
                // mailbox_sender_config
                get_pda(&[b"sender_config", &BRIDGE_PROGRAM.as_ref()], &MAILBOX_PROGRAM)
                    .readonly(),
                // outbound_message_path
                get_pda(&[b"outbound_message_path", chain_id.as_ref()], &MAILBOX_PROGRAM)
                    .readonly(),
            ],
            current_stage: OnrampDeriveStage::BuildDynamicAccounts1.to_string(),
            next_stage: OnrampDeriveStage::BuildDynamicAccounts2.to_string(),
            ..Default::default()
        })
    }

    pub fn build_dynamic_accounts2<'info>(
        ctx: Context<'_, '_, 'info, 'info, Empty>,
        _lock_or_burn: &LockOrBurnInV1,
    ) -> Result<DeriveAccountsResponse> {
        let mailbox_config = Account::<'info, Config>::try_from(&ctx.remaining_accounts[0])?;

        Ok(DeriveAccountsResponse {
            accounts_to_save: vec![
                // treasury
                mailbox_config.treasury.readonly(),
                // outbound_message
                get_pda(&[b"outbound_message", &mailbox_config.global_nonce.to_be_bytes()], &MAILBOX_PROGRAM).writable(),
            ],
            current_stage: OnrampDeriveStage::BuildDynamicAccounts2.to_string(),
            next_stage: "".to_string(),
            ..Default::default()
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_valid_signature() {
        let off_chain_data =
            hex::decode("00000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000184e288fb4a01f5bdf43ef0a045dc1709697593f10e7f58612f796b233be5363799f240e1a500000000000000000000000000000000000000000000000000000000000000400000000000000000000000000bc5e0b62b789fb8e35f9580aba3834c106d401f0512eac7448754de10479fc3089c1ed5f867ef47b846e7453a76cee4164853775e30b3b2c9c817c54dacae3d30ecc89b1266d427891f9b78f51ab70625d3315f00000000000000000000000000000000000000000000000000000000000000c00000000000000000000000000000000000000000000000000000000000000081019b4b122ffe8a8c36560f89107d538837eb0add2e479b0abd9fe1166e080058f7000000000000000000000000a730aaa4dafeb2c4755484f3a9dcb8c09d33a6a1c405dcd893d22aca445843f8ad202ba546403f075a132d53371a83741813eb6900000000000000000000000000000000000000000000000000000000000000640000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000")
                .unwrap();
        let expected_payload =
            hex::decode("e288fb4a01f5bdf43ef0a045dc1709697593f10e7f58612f796b233be5363799f240e1a500000000000000000000000000000000000000000000000000000000000000400000000000000000000000000bc5e0b62b789fb8e35f9580aba3834c106d401f0512eac7448754de10479fc3089c1ed5f867ef47b846e7453a76cee4164853775e30b3b2c9c817c54dacae3d30ecc89b1266d427891f9b78f51ab70625d3315f00000000000000000000000000000000000000000000000000000000000000c00000000000000000000000000000000000000000000000000000000000000081019b4b122ffe8a8c36560f89107d538837eb0add2e479b0abd9fe1166e080058f7000000000000000000000000a730aaa4dafeb2c4755484f3a9dcb8c09d33a6a1c405dcd893d22aca445843f8ad202ba546403f075a132d53371a83741813eb69000000000000000000000000000000000000000000000000000000000000006400000000000000000000000000000000000000000000000000000000000000")
                .unwrap();

        let payload = release_or_mint::payload_from_offchain_data(&off_chain_data).unwrap();

        assert_eq!(payload, expected_payload);
    }
}
