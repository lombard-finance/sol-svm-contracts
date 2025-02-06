use anchor_lang::prelude::*;
use std::io::{prelude::*, BufReader};

declare_id!("DG958H3tYj3QWTDPjsisb9CxS6TpdMUznYpgVg5bRd8P");

#[program]
pub mod lbtc {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        let chain_id = &ctx.accounts.chain_id;
        let deposit_btc_action = &ctx.accounts.deposit_btc_action;
        Ok(())
    }

    pub fn mint_from_payload(ctx: Context<MintFromPayload>, bytes: Vec<u8>) -> Result<()> {
        let mint_action = decode_mint_action(ctx, bytes)?;
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(
        init,
        payer = payer,
        space = 32 + 4 + 8
    )]
    pub chain_id: Account<'info, ChainID>,
    pub deposit_btc_action: Account<'info, DepositBtcAction>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct MintFromPayload<'info> {
    pub chain_id: Account<'info, ChainID>,
    pub deposit_btc_action: Account<'info, DepositBtcAction>,
}

#[account]
pub struct ChainID {
    id: [u8; 32],
}

#[account]
pub struct DepositBtcAction {
    action: u32,
}

struct MintAction {
    to_chain: [u8; 32],
    recipient: [u8; 32],
    amount: u64,
    txid: [u8; 32],
    vout: u32,
}

fn decode_mint_action(ctx: Context<MintFromPayload>, bytes: Vec<u8>) -> Result<MintAction> {
    let mut reader = BufReader::new(bytes.as_slice());

    // Check action bytes
    let mut action_bytes = [0u8; 4];
    reader.read_exact(&mut action_bytes)?;
    let action = u32::from_be_bytes(action_bytes);
    require!(
        action == ctx.accounts.deposit_btc_action.action,
        LBTCError::InvalidMintActionBytes
    );

    // Read to_chain
    let mut to_chain = [0u8; 32];
    reader.read_exact(&mut to_chain)?;
    require!(
        to_chain == ctx.accounts.chain_id.id,
        LBTCError::InvalidChainID
    );

    // Read recipient
    let mut recipient = [0u8; 32];
    reader.read_exact(&mut recipient)?;

    // Read amount
    let mut amount_bytes = [0u8; 32];
    reader.read_exact(&mut amount_bytes)?;

    // Remove padding, as ethereum left-pads encoded uint256. Then we convert to u64.
    // The amount is encoded as big-endian, and we assume to never exceed u64::MAX,
    // given that the maximum value of LBTC is 2_100_000_000_000_000, and u64::MAX
    // is defined as 18_446_744_073_709_551_615, so this should always fit.
    // Thus, we decode the leftover bytes as a big-endian u64.
    let amount = convert_to_u64_be(amount_bytes)?;

    // Read txid
    let mut txid = [0u8; 32];
    reader.read_exact(&mut txid)?;

    // Read vout
    let mut vout_bytes = [0u8; 32];
    reader.read_exact(&mut vout_bytes)?;
    let vout = convert_to_u32_be(vout_bytes)?;

    // Ensure buffer is now empty, to avoid collisions with deposits made previously.
    let mut leftover = vec![];
    reader.read_to_end(&mut leftover)?;
    if leftover.len() > 0 {
        err!(LBTCError::LeftoverData)
    } else {
        Ok(MintAction {
            to_chain,
            recipient,
            amount,
            txid,
            vout,
        })
    }
}

// Removes left-padded bytes and interprets the value as a big endian u64.
fn convert_to_u64_be(bytes: [u8; 32]) -> Result<u64> {
    let mut result = remove_padding(bytes);

    require!(result.len() <= 8, LBTCError::AmountTooLarge);

    // Insert bytes at the start until we hit 8 bytes in length (big-endian padding).
    while result.len() < 8 {
        result.insert(0, 0);
    }

    Ok(u64::from_be_bytes(
        result
            .try_into()
            .map_err(|_| LBTCError::CouldNotConvertToU64)?,
    ))
}

fn convert_to_u32_be(bytes: [u8; 32]) -> Result<u32> {
    let mut result = remove_padding(bytes);

    require!(result.len() <= 4, LBTCError::VoutTooLarge);

    // Insert bytes at the start until we hit 4 bytes in length (big-endian padding).
    while result.len() < 4 {
        result.insert(0, 0);
    }

    Ok(u32::from_be_bytes(
        result
            .try_into()
            .map_err(|_| LBTCError::CouldNotConvertToU32)?,
    ))
}

fn remove_padding(bytes: [u8; 32]) -> Vec<u8> {
    let mut result = vec![];
    let mut padding_removed = false;
    for byte in bytes {
        if !padding_removed && byte == 0 {
            continue;
        } else if !padding_removed && byte != 0 {
            padding_removed = true;
        }

        result.push(byte);
    }

    result
}

#[error_code]
pub enum LBTCError {
    #[msg("Invalid action bytes for mint payload")]
    InvalidMintActionBytes,
    #[msg("Invalid chain ID")]
    InvalidChainID,
    #[msg("Amount too large")]
    AmountTooLarge,
    #[msg("Vout too large")]
    VoutTooLarge,
    #[msg("Could not convert amount bytes to u64")]
    CouldNotConvertToU64,
    #[msg("Could not convert vout bytes to u32")]
    CouldNotConvertToU32,
    #[msg("Leftover data in payload")]
    LeftoverData,
}
