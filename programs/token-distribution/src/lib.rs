use anchor_lang::prelude::*;
use anchor_spl::token::{self, Transfer};
use std::result::Result;

pub mod merkle_proof;

// Declare program ID
declare_id!("FXqAYUc17LzLQcrUuwd6XQHLT9TYNhiSopW878Kb92DN");

#[program]
pub mod token_distribution {
    use super::*;
    // State account structure
    #[account]
    pub struct State {
        pub claim_amount: u64,
        pub merkle_root: [u8; 32],
        pub max_total_claim: u64,
        pub max_num_nodes: u64,
        pub total_amount_claimed: u64,
        pub num_nodes_claimed: u64,
        pub claimed: Vec<Pubkey>,
    }
    // Load state from account data
    impl State {
        pub fn load(account: &AccountInfo) -> Result<State, ProgramError> {
            State::try_from_slice(&account.data.borrow())
                .map_err(|_| ProgramError::InvalidAccountData)
        }
        // Save state to account data
        pub fn save(&self, account: &mut AccountInfo) -> Result<(), ProgramError> {
            account
                .data
                .borrow_mut()
                .copy_from_slice(&self.try_to_vec()?);
            Ok(())
        }
    }
    // Data account structute for whitelist
    #[account]
    pub struct Whitelist {
        pub addresses: Vec<Pubkey>,
        pub claim_amounts: Vec<u64>,
    }
    impl Whitelist {
        pub fn load(account: &AccountInfo) -> Result<Whitelist, ProgramError> {
            Whitelist::try_from_slice(&account.data.borrow())
                .map_err(|_| ProgramError::InvalidAccountData)
        }

        pub fn save(&self, account: &mut AccountInfo) -> Result<(), ProgramError> {
            account
                .data
                .borrow_mut()
                .copy_from_slice(&self.try_to_vec()?);
            Ok(())
        }
    }
    // Initialize the contract
    pub fn initialize(
        ctx: Context<Initialize>,
        claim_amount: u64,
        merkle_root: [u8; 32],
        max_total_claim: u64,
        max_num_nodes: u64,
    ) -> Result<(), ProgramError> {
        let state = State {
            claim_amount,
            merkle_root,
            max_total_claim,
            max_num_nodes,
            total_amount_claimed: 0,
            num_nodes_claimed: 0,
            claimed: Vec::new(),
        };
        state.save(&mut ctx.accounts.state)?;

        //Initialize the whitelist data account
        let whitelist = Whitelist {
            addresses: Vec::new(),
            claim_amounts: Vec::new(),
        };
        whitelist.save(&mut ctx.accounts.whitelist.to_account_info())?;
        Ok(())
    }
    // Claim tokens by a whitelisted address
    pub fn claim(
        ctx: Context<Claim>,
        amount: u64,
        merkle_proof: Vec<[u8; 32]>,
    ) -> Result<(), ProgramError> {
        let mut state = State::load(&ctx.accounts.state)?;

        // Check if the claimer has already claimed
        if state.claimed.contains(&ctx.accounts.claimer.key()) {
            return Err(ErrorCode::AlreadyClaimed.into());
        }

        // Verify the merkle proof
        let node = anchor_lang::solana_program::keccak::hashv(&[
            &ctx.accounts.claimer.key().to_bytes(),
            &amount.to_le_bytes(),
        ]);
        if !merkle_proof::verify(merkle_proof, state.merkle_root, node.0) {
            return Err(ErrorCode::InvalidProof.into());
        }
        // Transfer tokens to the claimer
        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.contract_token_account.to_account_info(),
                    to: ctx.accounts.claimer_token_account.to_account_info(),
                    authority: ctx.accounts.contract_authority.to_account_info(),
                },
            ),
            amount,
        )?;

        // Update state
        state.total_amount_claimed += amount;
        state.num_nodes_claimed += 1;
        state.claimed.push(ctx.accounts.claimer.key());
        state.save(&mut ctx.accounts.state)?;

        Ok(())
    }
    // Add an address to the whitelist
    pub fn add_whitelisted(
        ctx: Context<AddWhitelisted>,
        address: Pubkey,
        claim_amount: u64,
    ) -> Result<(), ProgramError> {
        let mut whitelist = Whitelist::load(&ctx.accounts.whitelist)?;

        if !whitelist.addresses.contains(&address) {
            whitelist.addresses.push(address);
            whitelist.claim_amounts.push(claim_amount);
            whitelist.save(&mut ctx.accounts.whitelist)?;
            Ok(())
        } else {
            Err(ErrorCode::AlreadyWhitelisted.into())
        }
    }
    // Owner function to fund the contract with a specified SPL token
    pub fn fund_contract(ctx: Context<FundContract>, amount: u64) -> Result<(), ProgramError> {
        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.funder.to_account_info(),
                    to: ctx.accounts.contract_token_account.to_account_info(),
                    authority: ctx.accounts.funder_authority.to_account_info(),
                },
            ),
            amount,
        )?;

        Ok(())
    }
}

// Account structure
#[derive(Accounts)]
pub struct Initialize<'info> {
    /// CHECK: Ensure that the funder account is mutable and signed by a valid signer.
    #[account(mut, signer)]
    pub funder: AccountInfo<'info>, // Funder account
    /// CHECK: Ensure that the contract token account is mutable.
    #[account(mut)]
    pub contract_token_account: AccountInfo<'info>,
    /// CHECK: Ensure that the funder authority is mutable.
    #[account(mut)]
    pub funder_authority: AccountInfo<'info>,
    /// CHECK: Ensure that the state account is mutable
    #[account(mut)]
    pub state: AccountInfo<'info>,
    /// CHECK:
    #[account(init, payer = funder, space = 256)]
    pub whitelist: Account<'info, Whitelist>,
    /// CHECK: Ensure that the token program account is immutable.
    pub token_program: AccountInfo<'info>,
    /// CHECK:
    pub system_program: AccountInfo<'info>,
}

#[derive(Accounts)]
pub struct Claim<'info> {
    /// CHECK:
    #[account(mut, signer)]
    pub claimer: AccountInfo<'info>,
    /// CHECK:
    #[account(mut)]
    pub claimer_token_account: AccountInfo<'info>,
    /// CHECK:
    #[account(mut)]
    pub contract_token_account: AccountInfo<'info>,
    /// CHECK:
    #[account(mut)]
    pub contract_authority: AccountInfo<'info>,
    /// CHECK:
    #[account(mut)]
    pub state: AccountInfo<'info>,
    /// CHECK:
    pub whitelist: AccountInfo<'info>,
    /// CHECK:
    pub token_program: AccountInfo<'info>,
}

#[derive(Accounts)]
pub struct AddWhitelisted<'info> {
    /// CHECK:
    #[account(mut)]
    pub whitelist: AccountInfo<'info>,
}
#[derive(Accounts)]
pub struct FundContract<'info> {
    /// CHECK:
    #[account(mut, signer)]
    pub funder: AccountInfo<'info>,
    /// CHECK:
    #[account(mut)]
    pub contract_token_account: AccountInfo<'info>,
    /// CHECK:
    #[account(mut)]
    pub funder_authority: AccountInfo<'info>,
    /// CHECK:
    #[account(mut)]
    pub token_program: AccountInfo<'info>,
}

#[error_code]
pub enum ErrorCode {
    #[msg("The claimer has already claimed their allocation.")]
    AlreadyClaimed,
    #[msg("Invalid Merkle proof")]
    InvalidProof,
    #[msg("Address is Already whitelisted.")]
    AlreadyWhitelisted,
}

impl From<ErrorCode> for ProgramError {
    fn from(error: ErrorCode) -> Self {
        match error {
            ErrorCode::AlreadyClaimed => ProgramError::Custom(1),
            ErrorCode::InvalidProof => ProgramError::Custom(2),
            ErrorCode::AlreadyWhitelisted => ProgramError::Custom(3),
        }
    }
}
