use anchor_lang::prelude::*;
use anchor_spl::token::{self, Transfer};
use std::result::Result;

// Declare program ID
declare_id!("FXqAYUc17LzLQcrUuwd6XQHLT9TYNhiSopW878Kb92DN");

const CLAIMED_ARRAY_SIZE: usize = 100;

#[program]
pub mod token_distribution {
    use super::*;
    // State account structure
    #[account]
    pub struct State {
        pub token_amount: u64,
        pub whitelist: Vec<Pubkey>, // List of whitelisted addresses
        pub claim_amount: u64,
        pub claimed: [Pubkey; CLAIMED_ARRAY_SIZE],
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
    // Initialize the contract
    pub fn initialize(
        ctx: Context<Initialize>,
        amount: u64,
        claim_amount: u64,
    ) -> Result<(), ProgramError> {
        // Transfer tokens to the contract
        let cpi_program = ctx.accounts.token_program.clone();
        let cpi_accounts = Transfer {
            from: ctx.accounts.funder.to_account_info().clone(),
            to: ctx
                .accounts
                .contract_token_account
                .to_account_info()
                .clone(),
            authority: ctx.accounts.funder_authority.clone(),
        };
        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
        token::transfer(cpi_ctx, amount)?;

        let state = State {
            token_amount: amount,
            whitelist: vec![],
            claim_amount,
            claimed: [Pubkey::default(); CLAIMED_ARRAY_SIZE],
        };
        state.save(&mut ctx.accounts.state)?;
        Ok(())
    }
    // Claim tokens by a whitelisted address
    pub fn claim(ctx: Context<Claim>) -> Result<(), ProgramError> {
        let mut state = State::load(&ctx.accounts.state)?;
        let claimer = &ctx.accounts.claimer.key();

        // Check if claimer is whitelisted
        if !state.whitelist.contains(&claimer) {
            return Err(ErrorCode::NotWhitelisted.into());
        }

        // Check if claimer is whitelisted
        let mut found = false;
        for i in 0..state.claimed.len() {
            if state.claimed[i] == Pubkey::default() {
                state.claimed[i] = *claimer;
                found = true;
                break;
            }
            if state.claimed[i] == *claimer {
                return Err(ErrorCode::AlreadyClaimed.into());
            }
        }

        if !found {
            return Err(ErrorCode::InsufficientCapacity.into());
        }
        // Transfer tokens to claimer
        let cpi_program = ctx.accounts.token_program.clone();
        let cpi_accounts = Transfer {
            from: ctx
                .accounts
                .contract_token_account
                .to_account_info()
                .clone(),
            to: ctx.accounts.claimer.to_account_info().clone(),
            authority: ctx.accounts.contract_authority.clone(),
        };
        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
        token::transfer(cpi_ctx, state.claim_amount)?;

        state.token_amount -= state.claim_amount;
        state.save(&mut ctx.accounts.state)?;
        Ok(())
    }
    // Add an address to the whitelist
    pub fn add_whitelisted(
        ctx: Context<AddWhitelisted>,
        address: Pubkey,
    ) -> Result<(), ProgramError> {
        let mut state = State::load(&ctx.accounts.state)?;
        if !state.whitelist.contains(&address) {
            state.whitelist.push(address);
            state.save(&mut ctx.accounts.state)?;
            Ok(())
        } else {
            Err(ErrorCode::AlreadyWhitelisted.into())
        }
    }
    // Set the quantity of tokens each whitelisted address can claim
    pub fn set_claim_amount(
        ctx: Context<SetClaimAmount>,
        claim_amount: u64,
    ) -> Result<(), ProgramError> {
        let mut state = State::load(&ctx.accounts.state)?;
        state.claim_amount = claim_amount;
        state.save(&mut ctx.accounts.state)?;
        Ok(())
    }
    // Set the whitelist
    pub fn set_whitelist(
        ctx: Context<SetWhitelist>,
        whitelist: Vec<Pubkey>,
    ) -> Result<(), ProgramError> {
        let mut state = State::load(&ctx.accounts.state)?;
        state.whitelist = whitelist;
        state.save(&mut ctx.accounts.state)?;
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
    /// CHECK: Ensure that the token program account is immutable.
    pub token_program: AccountInfo<'info>,
}

#[derive(Accounts)]
pub struct Claim<'info> {
    /// CHECK:
    #[account(mut, signer)]
    pub claimer: AccountInfo<'info>,
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
    pub token_program: AccountInfo<'info>,
}

#[derive(Accounts)]
pub struct AddWhitelisted<'info> {
    /// CHECK:
    #[account(mut)]
    pub state: AccountInfo<'info>,
}
#[derive(Accounts)]
pub struct SetClaimAmount<'info> {
    /// CHECK:
    #[account(mut)]
    pub state: AccountInfo<'info>,
}
#[derive(Accounts)]
pub struct SetWhitelist<'info> {
    /// CHECK:
    #[account(mut)]
    pub state: AccountInfo<'info>,
}
#[error_code]
pub enum ErrorCode {
    #[msg("The claimer is not whitelisted.")]
    NotWhitelisted,
    #[msg("The claimer has already claimed their allocation.")]
    AlreadyClaimed,
    #[msg("Insufficient capacity in the claimed array.")]
    InsufficientCapacity,
    #[msg("Address is Already whitelisted.")]
    AlreadyWhitelisted,
}

impl From<ErrorCode> for ProgramError {
    fn from(error: ErrorCode) -> Self {
        match error {
            ErrorCode::NotWhitelisted => ProgramError::Custom(1),
            ErrorCode::AlreadyClaimed => ProgramError::Custom(2),
            ErrorCode::InsufficientCapacity => ProgramError::Custom(3),
            ErrorCode::AlreadyWhitelisted => ProgramError::Custom(4),
        }
    }
}
