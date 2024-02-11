import * as anchor from "@coral-xyz/anchor";
import { Program, AnchorProvider, setProvider, web3 } from "@coral-xyz/anchor";
import {TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { TokenDistribution } from "../target/types/token_distribution";
import fs from 'fs';
import { Account, PublicKey, PublicKey as SolPublicKey, Keypair, Connection, Transaction, AccountInfo, TransactionInstruction } from "@solana/web3.js";
import BN from 'bn.js';
import { useAnchorWallet, useConnection } from "@solana/wallet-adapter-react"



describe("token-distribution", () => {
    // Load funder account from JSON file
    const funderAccountData = fs.readFileSync('./funder.json', 'utf8');
    
    const funderAccount = JSON.parse(funderAccountData);
    
    const connection = new anchor.web3.Connection("http://localhost:8899", 'confirmed');

    const provider = new AnchorProvider(connection, funderAccount, {})
    anchor.setProvider(provider);

    const idl = JSON.parse(fs.readFileSync('./target/idl/token_distribution.json', 'utf8'));
    const programId = new anchor.web3.PublicKey('FXqAYUc17LzLQcrUuwd6XQHLT9TYNhiSopW878Kb92DN');
    const program = new anchor.Program(idl, programId);

    // Test function to initialize the contract.
    async function initializeContract() {
        const amount = new BN(1000); // Amount of tokens to initialize
        const claimAmount = new BN(100); // Amount each claimer can claim

        // Initialize the contract.
        const tx = await program.rpc.initialize(amount, claimAmount, {
            accounts: {
                // No need to pass signers here, Anchor's Provider handles that internally
            },
        });

        console.log('Contract initialized:', tx);
    }

    // Test function to claim tokens.
    async function claimTokens(claimerPublicKey: anchor.web3.PublicKey) {
        // Claim tokens for the provided claimer public key.
        const tx = await program.rpc.claim({
            accounts: {
                // No need to pass signers here, Anchor's Provider handles that internally
            },
        });

        console.log('Tokens claimed:', tx);
    }

    // Test function to add an address to the whitelist.
    async function addToWhitelist(address: anchor.web3.PublicKey) {
        // Add the provided address to the whitelist.
        const tx = await program.rpc.addWhitelisted(address, {
            accounts: {
                // No need to pass signers here, Anchor's Provider handles that internally
            },
        });

        console.log('Address added to whitelist:', tx);
    }

    // Test function to set the claim amount.
    async function setClaimAmount(amount: number) {
        // Set the claim amount.
        const tx = await program.rpc.setClaimAmount(amount, {
            accounts: {
                // No need to pass signers here, Anchor's Provider handles that internally
            },
        });

        console.log('Claim amount set:', tx);
    }

    // Test function to set the whitelist.
    async function setWhitelist(whitelist: anchor.web3.PublicKey[]) {
        // Set the whitelist.
        const tx = await program.rpc.setWhitelist(whitelist, {
            accounts: {
                // No need to pass signers here, Anchor's Provider handles that internally
            },
        });

        console.log('Whitelist set:', tx);
    }

    // Example usage of test functions.
    async function test() {
        // Initialize the contract.
        await initializeContract();

        // Example address to add to the whitelist.
        const exampleAddress = new anchor.web3.PublicKey('exampleAddress');

        // Add address to the whitelist.
        await addToWhitelist(exampleAddress);

        // Set the claim amount.
        await setClaimAmount(50);

        // Set the whitelist.
        await setWhitelist([exampleAddress]);

        // Example claimer address.
        const claimerAddress = new anchor.web3.PublicKey('claimerAddress');

        // Claim tokens for the claimer.
        await claimTokens(claimerAddress);
    }

    // Run the test.
    test().catch(err => console.error(err));
});

