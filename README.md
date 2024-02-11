
##  Token-Distribution



`Framework:` Anchor Installation ```https://www.anchor-lang.com/docs/installation```






## Deployment

To deploy this project run

```bash
https://github.com/1111-1993/Token-Distribution.git
```
```bash 
anchor build
```
Note: If ```.so``` file created in directory ```target/deploy``` otherwise try
```bash
cargo build-bpf --manifest-path=./programs/staker/Cargo.toml --bpf-out-dir=target/deploy
```
then use command ```anchor keys list``` to find out ```Program Id``` and reaplace ```Anchor.toml``` and ```declare_id!``` in ```lib.rs```


```bash
anchor deploy
```
Install dependencies:
```bash
yarn install
```

```bash 
anchor test
```
or try this ```anchor test --skip-local-validator```


## Documentation

[Solana](https://docs.solana.com/)

[Anchor](https://www.anchor-lang.com/)

[Anchor Dependencies](https://www.anchor-lang.com/docs/installation/)



