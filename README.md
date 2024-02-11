
##  Token-Distribution



`Framework:` Anchor Installation ```https://www.anchor-lang.com/docs/installation```






## Deployment

To deploy this project run

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

[Solana](https://docs.solana.com/)

[Anchor](https://www.anchor-lang.com/)

[Anchor Dependencies](https://www.anchor-lang.com/docs/installation/)



