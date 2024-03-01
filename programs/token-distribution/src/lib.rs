use anchor_lang::prelude::*;
use anchor_spl::token::{self, Transfer};
use std::result::Result;

// Declare program ID
declare_id!("FXqAYUc17LzLQcrUuwd6XQHLT9TYNhiSopW878Kb92DN");

#[program]
pub mod token_distribution {
    use super::*;
    // State account structure
    #[account]
    pub struct State {
        pub token_amount: u64,
        pub claim_amount: u64,
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
            claim_amount,
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
    pub fn claim(ctx: Context<Claim>, _amount: u64) -> Result<(), ProgramError> {
        let state = State::load(&ctx.accounts.state)?;
        let whitelist = Whitelist::load(&ctx.accounts.whitelist)?;

        // Check in claimer is whitelisted
        let claimer = &ctx.accounts.claimer.key();
        let whitelist_index = whitelist.addresses.iter().position(|x| x == claimer);
        match whitelist_index {
            Some(index) => {
                // Check if claimer has already claimed
                if state.claimed.contains(claimer) {
                    return Err(ErrorCode::AlreadyClaimed.into());
                }

                //check if claim amount exceeds the allocated amount
                let claim_amount = whitelist.claim_amounts[index];
                if claim_amount < _amount {
                    return Err(ErrorCode::ClaimAmountExceedsAllocation.into());
                }

                //Transfer token to claimer
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
                token::transfer(cpi_ctx, _amount)?;

                Ok(())
            }
            None => Err(ErrorCode::NotWhitelisted.into()),
        }
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
        let cpi_program = ctx.accounts.token_program.clone();
        let cpi_account = Transfer {
            from: ctx.accounts.funder.to_account_info().clone(),
            to: ctx
                .accounts
                .contract_token_account
                .to_account_info()
                .clone(),
            authority: ctx.accounts.funder_authority.clone(),
        };
        let cpi_ctx = CpiContext::new(cpi_program, cpi_account);
        token::transfer(cpi_ctx, amount)?;

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
    #[msg("The claimer is not whitelisted.")]
    NotWhitelisted,
    #[msg("The claimer has already claimed their allocation.")]
    AlreadyClaimed,
    #[msg("Claim amount exceed the allocated amount.")]
    ClaimAmountExceedsAllocation,
    #[msg("Address is Already whitelisted.")]
    AlreadyWhitelisted,
}

impl From<ErrorCode> for ProgramError {
    fn from(error: ErrorCode) -> Self {
        match error {
            ErrorCode::NotWhitelisted => ProgramError::Custom(1),
            ErrorCode::AlreadyClaimed => ProgramError::Custom(2),
            ErrorCode::ClaimAmountExceedsAllocation => ProgramError::Custom(3),
            ErrorCode::AlreadyWhitelisted => ProgramError::Custom(4),
        }
    }
}
