mod consortium;
mod decoder;
pub mod errors;

use anchor_lang::prelude::*;
use anchor_spl::token_interface::{self, TokenAccount, TokenInterface};
use decoder::MintAction;
use errors::LBTCError;
use solana_program::{
    clock::Clock, hash::Hash, keccak::Hash as KeccakHash, secp256k1_recover::secp256k1_recover,
};

declare_id!("DG958H3tYj3QWTDPjsisb9CxS6TpdMUznYpgVg5bRd8P");

#[program]
pub mod lbtc {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        Ok(())
    }

    pub fn mint_from_payload(
        ctx: Context<MintFromPayload>,
        mint_payload: Vec<u8>,
        signatures: Vec<u8>,
        mint_payload_hash: [u8; 32],
    ) -> Result<()> {
        let amount = validate_mint(
            ctx.accounts.config,
            ctx.accounts.recipient,
            ctx.accounts.used,
            mint_payload,
            signatures,
            mint_payload_hash,
        )?;

        execute_mint(
            ctx.accounts.token_program.to_account_info(),
            ctx.accounts.recipient.to_account_info(),
            amount,
        )
    }

    pub fn redeem(ctx: Context<Redeem>, amount: u64) -> Result<()> {
        if !ctx.accounts.config.withdrawals_enabled {
            return err!(LBTCError::WithdrawalsDisabled);
        }

        // TODO calc fee and dust limit
        // TODO check redeem is greater than fee
        // TODO check leftover is greater than dust limit
        execute_burn(
            ctx.accounts.token_program.to_account_info(),
            ctx.accounts.payer.to_account_info(),
            amount,
        )
    }

    pub fn mint(ctx: Context<Mint>, amount: u64) -> Result<()> {
        if !ctx
            .accounts
            .config
            .minters
            .iter()
            .any(|&minter| minter == ctx.accounts.payer.key())
        {
            return err!(LBTCError::Unauthorized);
        }

        execute_mint(
            ctx.accounts.token_program.to_account_info(),
            ctx.accounts.recipient.to_account_info(),
            amount,
        )
    }

    pub fn burn(ctx: Context<Mint>, amount: u64) -> Result<()> {
        if !ctx
            .accounts
            .config
            .minters
            .iter()
            .any(|&minter| minter == ctx.accounts.payer.key())
        {
            return err!(LBTCError::Unauthorized);
        }

        execute_burn(
            ctx.accounts.token_program.to_account_info(),
            ctx.accounts.recipient.to_account_info(),
            amount,
        )
    }

    pub fn mint_with_fee(
        ctx: Context<MintWithFee>,
        mint_payload: Vec<u8>,
        signatures: Vec<u8>,
        mint_payload_hash: [u8; 32],
        fee_payload: Vec<u8>,
        fee_signature: [u8; 64],
        fee_pubkey: [u8; 64],
    ) -> Result<()> {
        if !ctx
            .accounts
            .config
            .claimers
            .iter()
            .any(|&claimer| claimer == ctx.accounts.payer.key())
        {
            return err!(LBTCError::Unauthorized);
        }

        let amount = validate_mint(
            ctx.accounts.config,
            ctx.accounts.recipient,
            ctx.accounts.used,
            mint_payload,
            signatures,
            mint_payload_hash,
        )?;

        let fee = validate_fee(ctx.accounts.config, fee_payload, fee_signature, fee_pubkey)?;
        if fee >= amount {
            return err!(LBTCError::FeeGTEAmount);
        }

        execute_mint(
            ctx.accounts.token_program.to_account_info(),
            ctx.accounts.treasury.to_account_info(),
            fee,
        )?;

        execute_mint(
            ctx.accounts.token_program.to_account_info(),
            ctx.accounts.recipient.to_account_info(),
            amount - fee,
        )
    }

    pub fn set_initial_valset(ctx: Context<Admin>, valset_payload: Vec<u8>) -> Result<()> {
        let valset_action = decoder::decode_valset_action(ctx.accounts.config, valset_payload)?;
        Ok(())
    }

    pub fn set_next_valset(
        ctx: Context<Cfg>,
        valset_payload: Vec<u8>,
        signatures: Vec<u8>,
    ) -> Result<()> {
        let valset_action = decoder::decode_valset_action(ctx.accounts.config, valset_payload)?;
        let signatures = decoder::decode_signatures(signatures)?;
        Ok(())
    }

    pub fn toggle_withdrawals(ctx: Context<Admin>) -> Result<()> {
        ctx.accounts.config.withdrawals_enabled = !ctx.accounts.config.withdrawals_enabled;
        Ok(())
    }

    pub fn toggle_bascule(ctx: Context<Admin>) -> Result<()> {
        ctx.accounts.config.bascule_enabled = !ctx.accounts.config.bascule_enabled;
        Ok(())
    }

    pub fn set_mint_fee(ctx: Context<Operator>, mint_fee: u64) -> Result<()> {
        ctx.accounts.config.mint_fee = mint_fee;
        Ok(())
    }

    pub fn set_burn_commission(ctx: Context<Admin>, commission: u64) -> Result<()> {
        ctx.accounts.config.burn_commission = commission;
        Ok(())
    }

    pub fn set_pauser(ctx: Context<Admin>, pauser: Pubkey) -> Result<()> {
        ctx.accounts.config.pauser = pauser;
        Ok(())
    }

    pub fn set_operator(ctx: Context<Admin>, operator: Pubkey) -> Result<()> {
        ctx.accounts.config.operator = operator;
        Ok(())
    }

    pub fn set_bascule(ctx: Context<Admin>, bascule: Pubkey) -> Result<()> {
        ctx.accounts.config.bascule = bascule;
        Ok(())
    }

    pub fn set_dust_fee_rate(ctx: Context<Admin>, rate: u64) -> Result<()> {
        ctx.accounts.config.dust_fee_rate = rate;
        Ok(())
    }

    pub fn set_chain_id(ctx: Context<Admin>, chain_id: [u8; 32]) -> Result<()> {
        ctx.accounts.config.chain_id = chain_id;
        Ok(())
    }

    pub fn set_deposit_btc_action(ctx: Context<Admin>, action: u32) -> Result<()> {
        ctx.accounts.config.deposit_btc_action = action;
        Ok(())
    }

    pub fn set_valset_action(ctx: Context<Admin>, action: u32) -> Result<()> {
        ctx.accounts.config.set_valset_action = action;
        Ok(())
    }

    pub fn set_fee_approval_action(ctx: Context<Admin>, action: u32) -> Result<()> {
        ctx.accounts.config.fee_approval_action = action;
        Ok(())
    }
}

fn validate_mint(
    config: Account<'_, Config>,
    recipient: InterfaceAccount<'_, TokenAccount>,
    used: Account<'_, Used>,
    mint_payload: Vec<u8>,
    signatures: Vec<u8>,
    mint_payload_hash: [u8; 32],
) -> Result<u64> {
    let mint_action = decoder::decode_mint_action(config, mint_payload)?;
    if mint_action.recipient != recipient.key() {
        return err!(LBTCError::RecipientMismatch);
    }

    let payload_hash = Hash::new(&mint_payload).to_bytes();
    if payload_hash != mint_payload_hash {
        return err!(LBTCError::MintPayloadHashMismatch);
    }

    let signatures = decoder::decode_signatures(signatures)?;
    consortium::check_signatures(config, signatures, payload_hash)?;

    if used.used {
        return err!(LBTCError::MintPayloadUsed);
    } else {
        used.used = true;
    }

    // Confirm deposit against bascule, if using.
    if config.bascule_enabled {
        // TODO
        // This is empty for now, while Bascule is being implemented as a Solana program.
    }

    Ok(mint_action.amount)
}

fn validate_fee(
    config: Account<'_, Config>,
    fee_payload: Vec<u8>,
    fee_signature: [u8; 64],
    fee_pubkey: [u8; 64],
) -> Result<u64> {
    let fee_action = decoder::decode_fee_payload(config, fee_payload)?;
    // Select correct fee
    let fee = if fee_action.fee > config.mint_fee {
        config.mint_fee
    } else {
        fee_action.fee
    };

    // Check expiry
    let clock = Clock::get()?;
    if clock.unix_timestamp as u64 > fee_action.expiry {
        return err!(LBTCError::FeeApprovalExpired);
    }

    // Check signature
    let hash = KeccakHash::new(&fee_payload).to_bytes();
    // Check first with v = 27.
    let pubkey = match secp256k1_recover(&hash, 0, &fee_signature) {
        Ok(pubkey) => pubkey.to_bytes(),
        Err(_) => return err!(LBTCError::Secp256k1RecoverError),
    };
    if pubkey != fee_pubkey {
        // If it fails, check with v = 28.
        let pubkey = match secp256k1_recover(&hash, 1, &fee_signature) {
            Ok(pubkey) => pubkey.to_bytes(),
            Err(_) => return err!(LBTCError::Secp256k1RecoverError),
        };
        require!(pubkey == fee_pubkey, LBTCError::InvalidFeeSignature);
    }

    Ok(fee)
}

fn execute_mint(token_program: AccountInfo<'_>, to: AccountInfo<'_>, amount: u64) -> Result<()> {
    token_interface::mint_to(
        CpiContext::new_with_signer(
            token_program,
            token_interface::MintTo {
                mint: ctx.accounts.common.mint.to_account_info(),
                to,
                authority: ctx.accounts.common.token_authority.to_account_info(),
            },
            token_authority_sig,
        ),
        amount,
    )
}

fn execute_burn(token_program: AccountInfo<'_>, from: AccountInfo<'_>, amount: u64) -> Result<()> {
    token_interface::burn(
        CpiContext::new_with_signer(
            token_program,
            token_interface::Burn {
                mint: ctx.accounts.common.mint.to_account_info(),
                from,
                authority: ctx.accounts.common.token_authority.to_account_info(),
            },
            token_authority_sig,
        ),
        amount,
    )
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(
        init,
        payer = payer,
        space = 8 + Config::INIT_SPACE
    )]
    pub config: Account<'info, Config>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Cfg<'info> {
    pub config: Account<'info, Config>,
}

#[derive(Accounts)]
#[instruction(mint_payload_hash: Vec<u8>)]
pub struct MintFromPayload<'info> {
    pub config: Account<'info, Config>,
    pub token_program: Interface<'info, TokenInterface>,
    pub recipient: InterfaceAccount<'info, TokenAccount>,
    #[account(mut, seeds = [&mint_payload_hash], bump)]
    pub used: Account<'info, Used>,
}

#[derive(Accounts)]
pub struct Mint<'info> {
    pub payer: Signer<'info>,
    pub config: Account<'info, Config>,
    pub token_program: Interface<'info, TokenInterface>,
    pub recipient: InterfaceAccount<'info, TokenAccount>,
}

#[derive(Accounts)]
#[instruction(mint_payload_hash: Vec<u8>)]
pub struct MintWithFee<'info> {
    pub payer: Signer<'info>,
    pub config: Account<'info, Config>,
    pub token_program: Interface<'info, TokenInterface>,
    pub recipient: InterfaceAccount<'info, TokenAccount>,
    pub treasury: InterfaceAccount<'info, TokenAccount>,
    #[account(mut, seeds = [&mint_payload_hash], bump)]
    pub used: Account<'info, Used>,
}

#[derive(Accounts)]
pub struct Redeem<'info> {
    pub payer: Signer<'info>,
    pub config: Account<'info, Config>,
    pub token_program: Interface<'info, TokenInterface>,
}

#[derive(Accounts)]
pub struct CfgWithSigner<'info> {
    pub payer: Signer<'info>,
    pub config: Account<'info, Config>,
}

#[derive(Accounts)]
pub struct Admin<'info> {
    #[account(address = config.admin)]
    pub payer: Signer<'info>,
    pub config: Account<'info, Config>,
}

#[derive(Accounts)]
pub struct Pauser<'info> {
    #[account(address = config.pauser)]
    pub payer: Signer<'info>,
    pub config: Account<'info, Config>,
}

#[derive(Accounts)]
pub struct Operator<'info> {
    #[account(address = config.operator)]
    pub payer: Signer<'info>,
    pub config: Account<'info, Config>,
}

#[account]
#[derive(InitSpace)]
pub struct Config {
    // Authorities
    pub admin: Pubkey,
    pub pauser: Pubkey,
    pub operator: Pubkey,
    #[max_len(100)]
    pub minters: Vec<Pubkey>,
    #[max_len(100)]
    pub claimers: Vec<Pubkey>,

    // Decoder fields
    pub chain_id: [u8; 32],
    pub deposit_btc_action: u32,
    pub set_valset_action: u32,
    pub fee_approval_action: u32,

    // Mint/redeem fields
    pub burn_commission: u64,
    pub withdrawals_enabled: bool,
    pub dust_fee_rate: u64,
    pub bascule_enabled: bool,
    pub bascule: Pubkey,

    // Global pause
    pub paused: bool,

    // Automint fields
    pub mint_fee: u64,

    // Consortium fields
    pub epoch: u64,
    #[max_len(102)]
    pub validators: Vec<[u8; 64]>,
    #[max_len(102)]
    pub weights: Vec<u64>,
    pub weight_threshold: u64,
}

#[account]
pub struct Used {
    used: bool,
}
