use std::io::{BufReader, Cursor, Read};
use anchor_lang::prelude::*;
use anchor_lang::solana_program;
use anchor_lang::solana_program::hash::hash  as sha256;
use base_token_pool::common::{
    CcipAccountMeta, CcipTokenPoolError, DeriveAccountsResponse, LockOrBurnInV1, ReleaseOrMintInV1,
    ToMeta, POOL_CHAINCONFIG_SEED,
};
use core::fmt;
use std::{
    fmt::{Display, Formatter},
    str::FromStr,
};

use crate::{
    context::{BRIDGE_PROGRAM, get_pda, Empty, MAILBOX_PROGRAM}, 
    errors::LombardTokenPoolError,
    state::ChainConfig,
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
        RetrieveChainConfig,
        BuildDynamicAccounts,
    }

    impl Display for OfframpDeriveStage {
        fn fmt(&self, f: &mut Formatter) -> fmt::Result {
            match self {
                OfframpDeriveStage::RetrieveChainConfig => f.write_str("RetrieveChainConfig"),
                OfframpDeriveStage::BuildDynamicAccounts => f.write_str("BuildDynamicAccounts"),
            }
        }
    }

    impl FromStr for OfframpDeriveStage {
        type Err = CcipTokenPoolError;

        fn from_str(s: &str) -> std::result::Result<Self, Self::Err> {
            match s {
                "Start" | "RetrieveChainConfig" => Ok(Self::RetrieveChainConfig),
                "BuildDynamicAccounts" => Ok(Self::BuildDynamicAccounts),
                _ => Err(CcipTokenPoolError::InvalidDerivationStage),
            }
        }
    }

    pub fn retrieve_chain_config(
        release_or_mint: &ReleaseOrMintInV1,
    ) -> Result<DeriveAccountsResponse> {
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
            accounts_to_save: vec![
                // // cctp_authority_pda
                // get_message_transmitter_pda(&[
                //     b"message_transmitter_authority",
                //     TOKEN_MESSENGER_MINTER.as_ref(),
                // ])
                // .readonly(),
            ],
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
                // local_token_config
                get_pda(&[b"local_token_config", mint.as_ref()], &BRIDGE_PROGRAM)
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
                solana_program::system_program::ID.readonly(),
            ],
            current_stage: OfframpDeriveStage::BuildDynamicAccounts.to_string(),
            ..Default::default()
        })
    }


    pub fn payload_from_offchain_data(bytes: &[u8]) -> Result<Vec<u8>> {
        // check length is at least for all static fields and length of dynamic fields
        // 32 for the tuple length and 32 for each field
        // plus 4 for the message selector
        require!(bytes.len() >= 32 * 2, LombardTokenPoolError::InvalidPayloadLength);

        let mut reader = BufReader::new(Cursor::new(bytes));

        // check selector
        let mut offset_bytes = [0u8; 32];
        reader.read_exact(&mut offset_bytes)?;
        let offset = u64::from_be_bytes(offset_bytes[24..32].try_into().unwrap());
        require!(offset > 32, LombardTokenPoolError::InvalidPayload);
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
        RetrieveChainConfig,
        BuildDynamicAccounts,
    }

    impl Display for OnrampDeriveStage {
        fn fmt(&self, f: &mut Formatter) -> fmt::Result {
            match self {
                OnrampDeriveStage::RetrieveChainConfig => f.write_str("RetrieveChainConfig"),
                OnrampDeriveStage::BuildDynamicAccounts => f.write_str("BuildDynamicAccounts"),
            }
        }
    }

    impl FromStr for OnrampDeriveStage {
        type Err = CcipTokenPoolError;

        fn from_str(s: &str) -> std::result::Result<Self, Self::Err> {
            match s {
                "Start" | "RetrieveChainConfig" => Ok(Self::RetrieveChainConfig),
                "BuildDynamicAccounts" => Ok(Self::BuildDynamicAccounts),
                _ => Err(CcipTokenPoolError::InvalidDerivationStage),
            }
        }
    }

    pub fn retrieve_chain_config(lock_or_burn: &LockOrBurnInV1) -> Result<DeriveAccountsResponse> {
        Ok(DeriveAccountsResponse {
            ask_again_with: vec![find(
                &[
                    POOL_CHAINCONFIG_SEED,
                    &lock_or_burn.remote_chain_selector.to_le_bytes(),
                    lock_or_burn.local_token.as_ref(),
                ],
                crate::ID,
            )],
            // The static PDAs have mostly already been returned by CCIP via the LUT, so we just return here the ones not shared with offramp (so not in LUT)
            accounts_to_save: vec![
                // get_token_messenger_minter_pda(&[b"sender_authority"]).readonly()
            ],
            current_stage: OnrampDeriveStage::RetrieveChainConfig.to_string(),
            next_stage: OnrampDeriveStage::BuildDynamicAccounts.to_string(),
            ..Default::default()
        })
    }

    pub fn build_dynamic_accounts<'info>(
        _ctx: Context<Empty>,
        _lock_or_burn: &LockOrBurnInV1,
    ) -> Result<DeriveAccountsResponse> {
        // let chain_config = Account::<'info, ChainConfig>::try_from(&ctx.remaining_accounts[0])?;
        // let domain_id = chain_config.cctp.domain_id;
        // let domain_str = domain_id.to_string();
        // let domain_seed = domain_str.as_bytes();

        // msg!(
        //     "Sender: {:?}, selector: {:?}, nonce: {:?}",
        //     lock_or_burn.original_sender,
        //     lock_or_burn.remote_chain_selector,
        //     lock_or_burn.msg_total_nonce
        // );

        Ok(DeriveAccountsResponse {
            accounts_to_save: vec![
                // // cctp_remote_token_messenger_key
                // get_token_messenger_minter_pda(&[b"remote_token_messenger", domain_seed])
                //     .readonly(),
                // // cctp_message_sent_event
                // find(
                //     &[
                //         MESSAGE_SENT_EVENT_SEED,
                //         &lock_or_burn.original_sender.to_bytes(),
                //         &lock_or_burn.remote_chain_selector.to_le_bytes(),
                //         &lock_or_burn.msg_total_nonce.to_le_bytes(),
                //     ],
                //     crate::ID,
                // )
                // .writable(),
            ],
            current_stage: OnrampDeriveStage::BuildDynamicAccounts.to_string(),
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
            hex::decode("0000000000000000000000000000000000000000000000000000000000000040000000000000000000000000000000000000000000000000000000000000016000000000000000000000000000000000000000000000000000000000000000e45c70a5050000000000000000000000000000000000000000000000000000000000014a34000000000000000000000000ca571682d1478ab3f7fcbcbade6e4954de3a96760000000000000000000000000000000000000000000000000000000000000061000000000000000000000000ca571682d1478ab3f7fcbcbade6e4954de3a96760000000000000000000000004b431813bcf797bf9bf93890656618ac80a1d5d20000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000001500000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000024000000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000004000000000000000000000000000000000000000000000000000000000000008000000000000000000000000000000000000000000000000000000000000000e0000000000000000000000000000000000000000000000000000000000000014000000000000000000000000000000000000000000000000000000000000001a0000000000000000000000000000000000000000000000000000000000000004016ccaa45717ad58e4d24ab0dfa8f8539f1a1902832536f92a3d936c7efb955e330b5557c558aeb1c95b0eb625ef426169dc53301ea811675849f89a531fb5ac400000000000000000000000000000000000000000000000000000000000000400ab1d532dcf2161b82d83491c5031ae12f370bb8ab0e19619108d7b3e7c1929230b7c01d80acd0190c526085abee47bc6e5b5ff08180859cebbc4a9abf14d69a0000000000000000000000000000000000000000000000000000000000000040956350f4f25665dd7077a224d098c84370196f03177ec0c9a290aba5465f2f273d773275d22d254ec69e2f7b65caa791a5329c3d44a1e9d725659d41423134520000000000000000000000000000000000000000000000000000000000000040272db3981d691f09aab012490041b70d4e1b5adb6bed27799023f8b2544d07cd1c70fb85b0f2d4d5a8b59ef3b860c93c531d211a332e0cc843c94af86fce0859")
                .unwrap();
        let expected_payload =
            hex::decode("5c70a5050000000000000000000000000000000000000000000000000000000000014a34000000000000000000000000ca571682d1478ab3f7fcbcbade6e4954de3a96760000000000000000000000000000000000000000000000000000000000000061000000000000000000000000ca571682d1478ab3f7fcbcbade6e4954de3a96760000000000000000000000004b431813bcf797bf9bf93890656618ac80a1d5d200000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000015")
                .unwrap();

        let payload = release_or_mint::payload_from_offchain_data(&off_chain_data).unwrap();

        assert_eq!(payload, expected_payload);
    }
}
