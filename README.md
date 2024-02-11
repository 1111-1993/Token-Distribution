
##  Token-Distribution

Solana smart contract for distributing SPL tokens to whitelisted addresses. It initializes the contract with SPL token and claim amounts, allows whitelisted addresses to claim tokens, manages the whitelist, and sets claim amounts. The code ensures proper error handling, state management, and documentation throughout the contract's functionality.








## Deployment

To deploy this project run

`Framework:` Anchor Installation ```https://www.anchor-lang.com/docs/installation```

```bash
git clone https://github.com/1111-1993/Token-Distribution.git
```
```bash 
anchor build
```
Note: If ```.so``` file created in directory ```target/deploy``` otherwise try
```bash
cargo build-bpf --manifest-path=./programs/staker/Cargo.toml --bpf-out-dir=target/deploy
```
then use command ```anchor keys list``` to find out ```Program Id``` and reaplace ```Anchor.toml``` and ```declare_id!``` in ```lib.rs```

```solana-test-validator --reset``` for local validator
 


```bash
anchor deploy
```
Install dependencies:
```bash
yarn install
```

for test 
```bash 
anchor run test
```
Well, it turns out anchor has a special command that takes care of that full cycle for us. It's called:

```bash 
anchor test
```
or try this ```anchor test --skip-local-validator```


## Documentation

Solana smart contract for token distribution using the Anchor framework. Here's its functionality:

`In Solana, everything is an account`

### State Account
- The `State` account structure defines the program's state stored on-chain.
  - `token_amount`: Total amount of SPL tokens held by the contract.
  - `whitelist`: List of whitelisted addresses eligible for claiming tokens.
  - `claim_amount`: Amount of tokens each whitelisted address can claim.
  - `claimed`: Array tracking which addresses have claimed tokens.


### Entry Points
1. **Initialize**
   - Initializes the contract with an initial token amount and claim amount.
   - Transfers tokens to the contract's token account.
   - Saves the contract state.

2. **Claim**
   - Allows whitelisted addresses to claim their allocated tokens.
   - Checks if the claimer is whitelisted and hasn't already claimed tokens.
   - Transfers tokens to the claimer and updates the state.

3. **Add Whitelisted**
   - Adds an address to the whitelist if it's not already whitelisted.

4. **Set Claim Amount**
   - Sets the quantity of tokens each whitelisted address can claim.


### Error Handling
- Errors are defined using the `ErrorCode` enum and converted to `ProgramError`.
- Error codes include not being whitelisted, already claimed, insufficient capacity, and already whitelisted.

### Accounts
- Structs like `Initialize`, `Claim`, `AddWhitelisted`, `SetClaimAmount`, and `SetWhitelist` define account structures required for each entry point.
- These structs specify the required accounts and their mutability for each entry point.

### Conversion and Validation
- Methods like `load` and `save` in the `State` implementation handle conversion to/from byte slices and validation of account data.



[Solana](https://docs.solana.com/)

[Anchor](https://www.anchor-lang.com/)

[Anchor Dependencies](https://www.anchor-lang.com/docs/installation/)



