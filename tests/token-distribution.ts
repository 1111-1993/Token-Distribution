import { strict as assert } from 'node:assert';
import * as anchor from "@coral-xyz/anchor";
import NodeWallet from '@coral-xyz/anchor/dist/cjs/nodewallet';
import { Program, AnchorProvider, web3 } from "@coral-xyz/anchor";
import {
  Connection,
  PublicKey,
  Keypair,
  Transaction,
  SystemProgram,
  TransactionInstruction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import { Token, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { 
  createAllocTreeIx, 
  createInitEmptyMerkleTreeIx, 
  createReplaceIx, 
  hash, 
  MerkleTree,
  ConcurrentMerkleTreeAccount,
  createAppendIx,
  createCloseEmptyTreeInstruction,
  createTransferAuthorityIx,
  createVerifyLeafIx,
  ValidDepthSizePair,
} from "@solana/spl-account-compression";

import crypto from 'crypto';
import { BN } from 'bn.js';
import * as fs from "fs";
import { Buffer } from "buffer";

import { TokenDistribution } from "../target/types/token_distribution";
import { createTreeOnChain, execute } from './utils';

// Function to read a file synchronously
function readFileSync(path: string): Buffer {
  return Buffer.from(fs.readFileSync(path, "utf-8"), "base64");
}
const program = anchor.workspace.TokenDistribution as Program<TokenDistribution>;
const connection = new anchor.web3.Connection('http://localhost:8899', {commitment: 'confirmed'});

// eslint-disable-next-line no-empty
describe('Account Compression', () => {
// Configure the client to use the local cluster.
let offChainTree: MerkleTree;
let cmtKeypair: Keypair;
let cmt: PublicKey;
let payerKeypair: Keypair;
let payer: PublicKey;
let connection: Connection;
let provider: AnchorProvider;

const MAX_SIZE = 64;
const MAX_DEPTH = 14;
const DEPTH_SIZE_PAIR: ValidDepthSizePair = {
    maxBufferSize: MAX_SIZE,
    maxDepth: MAX_DEPTH,
};

beforeEach(async () => {
    payerKeypair = anchor.web3.Keypair.generate();
    payer = payerKeypair.publicKey;
    connection = new Connection('http://localhost:8899', {
        commitment: 'confirmed',
    });
    const wallet = new NodeWallet(payerKeypair);
    provider = new AnchorProvider(connection, wallet, {
        commitment: connection.commitment,
        skipPreflight: true,
    });

    await provider.connection.confirmTransaction(
        await provider.connection.requestAirdrop(payer, 1e10),
        'confirmed'
    );
});

describe('Having created a tree with a single leaf', () => {
    beforeEach(async () => {
        [cmtKeypair, offChainTree] = await createTreeOnChain(provider, payerKeypair, 1, DEPTH_SIZE_PAIR);
        cmt = cmtKeypair.publicKey;
    });
    it('Append single leaf', async () => {
        const newLeaf = crypto.randomBytes(32);
        const appendIx = createAppendIx(cmt, payer, newLeaf);

        await execute(provider, [appendIx], [payerKeypair]);
        offChainTree.updateLeaf(1, newLeaf);

        const splCMT = await ConcurrentMerkleTreeAccount.fromAccountAddress(connection, cmt);
        const onChainRoot = splCMT.getCurrentRoot();

        assert(
            Buffer.from(onChainRoot).equals(offChainTree.root),
            'Updated on chain root matches root of updated off chain tree'
        );
    });
    it('Verify proof works for that leaf', async () => {
        const newLeaf = crypto.randomBytes(32);
        const index = 0;
        const proof = offChainTree.getProof(index);

        const verifyLeafIx = createVerifyLeafIx(cmt, proof);
        const replaceLeafIx = createReplaceIx(cmt, payer, newLeaf, proof);
        await execute(provider, [verifyLeafIx, replaceLeafIx], [payerKeypair]);

        offChainTree.updateLeaf(index, newLeaf);

        const splCMT = await ConcurrentMerkleTreeAccount.fromAccountAddress(connection, cmt);
        const onChainRoot = splCMT.getCurrentRoot();

        assert(
            Buffer.from(onChainRoot).equals(offChainTree.root),
            'Updated on chain root matches root of updated off chain tree'
        );
    });
    it('Verify leaf fails when proof fails', async () => {
        const newLeaf = crypto.randomBytes(32);
        const index = 0;
        // Replace valid proof with random bytes so it is wrong
        const proof = offChainTree.getProof(index);
        proof.proof = proof.proof.map(_ => {
            return crypto.randomBytes(32);
        });

        // Verify proof is invalid
        const verifyLeafIx = createVerifyLeafIx(cmt, proof);
        try {
            await execute(provider, [verifyLeafIx], [payerKeypair]);
            assert(false, 'Proof should have failed to verify');
        } catch {}

        // Replace instruction with same proof fails
        const replaceLeafIx = createReplaceIx(cmt, payer, newLeaf, proof);
        try {
            await execute(provider, [replaceLeafIx], [payerKeypair]);
            assert(false, 'Replace should have failed to verify');
        } catch {}

        const splCMT = await ConcurrentMerkleTreeAccount.fromAccountAddress(connection, cmtKeypair.publicKey);
        const onChainRoot = splCMT.getCurrentRoot();

        assert(
            Buffer.from(onChainRoot).equals(offChainTree.root),
            'Updated on chain root matches root of updated off chain tree'
        );
    });
    it('Replace that leaf', async () => {
        const newLeaf = crypto.randomBytes(32);
        const index = 0;

        const replaceLeafIx = createReplaceIx(cmt, payer, newLeaf, offChainTree.getProof(index, false, -1));
        assert(replaceLeafIx.keys.length == 3 + MAX_DEPTH, `Failed to create proof for ${MAX_DEPTH}`);

        await execute(provider, [replaceLeafIx], [payerKeypair]);

        offChainTree.updateLeaf(index, newLeaf);

        const splCMT = await ConcurrentMerkleTreeAccount.fromAccountAddress(connection, cmt);
        const onChainRoot = splCMT.getCurrentRoot();

        assert(
            Buffer.from(onChainRoot).equals(offChainTree.root),
            'Updated on chain root matches root of updated off chain tree'
        );
    });

    it('Replace that leaf with a minimal proof', async () => {
        const newLeaf = crypto.randomBytes(32);
        const index = 0;

        const replaceLeafIx = createReplaceIx(cmt, payer, newLeaf, offChainTree.getProof(index, true, 1));
        assert(replaceLeafIx.keys.length == 3 + 1, 'Failed to minimize proof to expected size of 1');
        await execute(provider, [replaceLeafIx], [payerKeypair]);

        offChainTree.updateLeaf(index, newLeaf);

        const splCMT = await ConcurrentMerkleTreeAccount.fromAccountAddress(connection, cmt);
        const onChainRoot = splCMT.getCurrentRoot();

        assert(
            Buffer.from(onChainRoot).equals(offChainTree.root),
            'Updated on chain root matches root of updated off chain tree'
        );
    });
});

describe('Examples transferring authority', () => {
    const authorityKeypair = anchor.web3.Keypair.generate();
    const authority = authorityKeypair.publicKey;
    const randomSignerKeypair = anchor.web3.Keypair.generate();
    const randomSigner = randomSignerKeypair.publicKey;

    beforeEach(async () => {
        await provider.connection.confirmTransaction(
            await (connection as Connection).requestAirdrop(authority, 1e10)
        );
        [cmtKeypair, offChainTree] = await createTreeOnChain(provider, authorityKeypair, 1, DEPTH_SIZE_PAIR);
        cmt = cmtKeypair.publicKey;
    });
    it('Attempting to replace with random authority fails', async () => {
        const newLeaf = crypto.randomBytes(32);
        const replaceIndex = 0;
        const proof = offChainTree.getProof(replaceIndex);
        const replaceIx = createReplaceIx(cmt, randomSigner, newLeaf, proof);

        try {
            await execute(provider, [replaceIx], [randomSignerKeypair]);
            assert(false, 'Transaction should have failed since incorrect authority cannot execute replaces');
        } catch {}
    });
    it('Can transfer authority', async () => {
        const transferAuthorityIx = createTransferAuthorityIx(cmt, authority, randomSigner);
        await execute(provider, [transferAuthorityIx], [authorityKeypair]);

        const splCMT = await ConcurrentMerkleTreeAccount.fromAccountAddress(connection, cmt);

        assert(
            splCMT.getAuthority().equals(randomSigner),
            `Upon transferring authority, authority should be ${randomSigner.toString()}, but was instead updated to ${splCMT.getAuthority()}`
        );

        // Attempting to replace with new authority now works
        const newLeaf = crypto.randomBytes(32);
        const replaceIndex = 0;
        const proof = offChainTree.getProof(replaceIndex);
        const replaceIx = createReplaceIx(cmt, randomSigner, newLeaf, proof);

        await execute(provider, [replaceIx], [randomSignerKeypair]);
    });
});

describe(`Having created a tree with ${MAX_SIZE} leaves`, () => {
    beforeEach(async () => {
        [cmtKeypair, offChainTree] = await createTreeOnChain(provider, payerKeypair, MAX_SIZE, DEPTH_SIZE_PAIR);
        cmt = cmtKeypair.publicKey;
    });
    it(`Replace all of them in a block`, async () => {
        // Replace 64 leaves before syncing off-chain tree with on-chain tree
        const ixArray: TransactionInstruction[] = [];
        const txList: Promise<string>[] = [];

        const leavesToUpdate: Buffer[] = [];
        for (let i = 0; i < MAX_SIZE; i++) {
            const index = i;
            const newLeaf = hash(payer.toBuffer(), Buffer.from(new BN(i).toArray()));
            leavesToUpdate.push(newLeaf);
            const proof = offChainTree.getProof(index);
            const replaceIx = createReplaceIx(cmt, payer, newLeaf, proof);
            ixArray.push(replaceIx);
        }

        // Execute all replaces
        ixArray.map(ix => {
            txList.push(execute(provider, [ix], [payerKeypair]));
        });
        await Promise.all(txList);

        leavesToUpdate.map((leaf, index) => {
            offChainTree.updateLeaf(index, leaf);
        });

        // Compare on-chain & off-chain roots
        const splCMT = await ConcurrentMerkleTreeAccount.fromAccountAddress(connection, cmt);
        const onChainRoot = splCMT.getCurrentRoot();

        assert(
            Buffer.from(onChainRoot).equals(offChainTree.root),
            'Updated on chain root does not match root of updated off chain tree'
        );
    });
    it('Empty all of the leaves and close the tree', async () => {
        const ixArray: TransactionInstruction[] = [];
        const txList: Promise<string>[] = [];
        const leavesToUpdate: Buffer[] = [];
        for (let i = 0; i < MAX_SIZE; i++) {
            const index = i;
            const newLeaf = hash(payer.toBuffer(), Buffer.from(new BN(i).toArray()));
            leavesToUpdate.push(newLeaf);
            const proof = offChainTree.getProof(index);
            const replaceIx = createReplaceIx(cmt, payer, Buffer.alloc(32), proof);
            ixArray.push(replaceIx);
        }
        // Execute all replaces
        ixArray.map(ix => {
            txList.push(execute(provider, [ix], [payerKeypair]));
        });
        await Promise.all(txList);

        let payerInfo = await provider.connection.getAccountInfo(payer, 'confirmed')!;
        let treeInfo = await provider.connection.getAccountInfo(cmt, 'confirmed')!;

        const payerLamports = payerInfo!.lamports;
        const treeLamports = treeInfo!.lamports;

        const ix = createCloseEmptyTreeInstruction({
            authority: payer,
            merkleTree: cmt,
            recipient: payer,
        });
        await execute(provider, [ix], [payerKeypair]);

        payerInfo = await provider.connection.getAccountInfo(payer, 'confirmed')!;
        const finalLamports = payerInfo!.lamports;
        assert(
            finalLamports === payerLamports + treeLamports - 5000,
            'Expected payer to have received the lamports from the closed tree account'
        );

        treeInfo = await provider.connection.getAccountInfo(cmt, 'confirmed');
        assert(treeInfo === null, 'Expected the merkle tree account info to be null');
    });
    it('It cannot be closed until empty', async () => {
        const ix = createCloseEmptyTreeInstruction({
            authority: payer,
            merkleTree: cmt,
            recipient: payer,
        });
        try {
            await execute(provider, [ix], [payerKeypair]);
            assert(false, 'Closing a tree account before it is empty should ALWAYS error');
        } catch (e) {}
    });
});

describe(`Having created a tree with depth 3`, () => {
    const DEPTH = 3;
    beforeEach(async () => {
        [cmtKeypair, offChainTree] = await createTreeOnChain(provider, payerKeypair, 0, {
            maxBufferSize: 8,
            maxDepth: DEPTH,
        });
        cmt = cmtKeypair.publicKey;

        for (let i = 0; i < 2 ** DEPTH; i++) {
            const newLeaf = Array.from(Buffer.alloc(32, i + 1));
            const appendIx = createAppendIx(cmt, payer, newLeaf);
            await execute(provider, [appendIx], [payerKeypair]);
        }

        // Compare on-chain & off-chain roots
        const splCMT = await ConcurrentMerkleTreeAccount.fromAccountAddress(connection, cmt);

        assert(splCMT.getBufferSize() === 2 ** DEPTH, 'Not all changes were processed');
        assert(splCMT.getCurrentBufferIndex() === 0, 'Not all changes were processed');
    });

    it('Random attacker fails to fake the existence of a leaf by autocompleting proof', async () => {
        const maliciousLeafHash = crypto.randomBytes(32);
        const maliciousLeafHash1 = crypto.randomBytes(32);
        const nodeProof: Buffer[] = [];
        for (let i = 0; i < DEPTH; i++) {
            nodeProof.push(Buffer.alloc(32));
        }

        // Root - make this nonsense so it won't match what's in ChangeLog, thus forcing proof autocompletion
        const replaceIx = createReplaceIx(cmt, payer, maliciousLeafHash1, {
            leaf: maliciousLeafHash,
            leafIndex: 0,
            proof: nodeProof,
            root: Buffer.alloc(32),
        });

        try {
            await execute(provider, [replaceIx], [payerKeypair]);
            assert(false, 'Attacker was able to successfully write fake existence of a leaf');
        } catch (e) {}

        const splCMT = await ConcurrentMerkleTreeAccount.fromAccountAddress(connection, cmt);

        assert(
            splCMT.getCurrentBufferIndex() === 0,
            "CMT updated its active index after attacker's transaction, when it shouldn't have done anything"
        );
    });
});
describe(`Canopy test`, () => {
    const DEPTH = 5;
    it(`Testing canopy for verify leaf instructions`, async () => {
        [cmtKeypair, offChainTree] = await createTreeOnChain(
            provider,
            payerKeypair,
            2 ** DEPTH,
            { maxBufferSize: 8, maxDepth: DEPTH },
            DEPTH // Store full tree on chain
        );
        cmt = cmtKeypair.publicKey;

        const splCMT = await ConcurrentMerkleTreeAccount.fromAccountAddress(connection, cmt, 'confirmed');
        let i = 0;
        const stepSize = 4;
        while (i < 2 ** DEPTH) {
            const ixs: TransactionInstruction[] = [];
            for (let j = 0; j < stepSize; j += 1) {
                const leafIndex = i + j;
                const leaf = offChainTree.leaves[leafIndex].node;
                const verifyIx = createVerifyLeafIx(cmt, {
                    leaf,
                    leafIndex,
                    proof: [],
                    root: splCMT.getCurrentRoot(),
                });
                ixs.push(verifyIx);
            }
            i += stepSize;
            await execute(provider, ixs, [payerKeypair]);
        }
    });
    it('Testing canopy for appends and replaces on a full on chain tree', async () => {
        [cmtKeypair, offChainTree] = await createTreeOnChain(
            provider,
            payerKeypair,
            0,
            { maxBufferSize: 8, maxDepth: DEPTH },
            DEPTH // Store full tree on chain
        );
        cmt = cmtKeypair.publicKey;

        // Test that the canopy updates properly throughout multiple modifying instructions
        // in the same transaction
        const leaves: Array<number>[] = [];
        let i = 0;
        const stepSize = 4;
        while (i < 2 ** DEPTH) {
            const ixs: TransactionInstruction[] = [];
            for (let j = 0; j < stepSize; ++j) {
                const newLeaf = Array.from(Buffer.alloc(32, i + 1));
                leaves.push(newLeaf);
                const appendIx = createAppendIx(cmt, payer, newLeaf);
                ixs.push(appendIx);
            }
            await execute(provider, ixs, [payerKeypair]);
            i += stepSize;
            console.log('Appended', i, 'leaves');
        }

        // Compare on-chain & off-chain roots
        let ixs: TransactionInstruction[] = [];
        const splCMT = await ConcurrentMerkleTreeAccount.fromAccountAddress(connection, cmt);
        const root = splCMT.getCurrentRoot();

        // Test that the entire state of the tree is stored properly
        // by using the canopy to infer proofs to all of the leaves in the tree.
        // We test that the canopy is updating properly by replacing all the leaves
        // in the tree
        const leafList = Array.from(leaves.entries());
        leafList.sort(() => Math.random() - 0.5);
        let replaces = 0;
        const newLeaves: Record<number, Buffer> = {};
        for (const [i, leaf] of leafList) {
            const newLeaf = crypto.randomBytes(32);
            newLeaves[i] = newLeaf;
            const replaceIx = createReplaceIx(cmt, payer, newLeaf, {
                leaf: Buffer.from(Uint8Array.from(leaf)),
                leafIndex: i,
                proof: [],
                root, // No proof necessary
            });
            ixs.push(replaceIx);
            if (ixs.length == stepSize) {
                replaces++;
                await execute(provider, ixs, [payerKeypair]);
                console.log('Replaced', replaces * stepSize, 'leaves');
                ixs = [];
            }
        }

        const newLeafList: Buffer[] = [];
        for (let i = 0; i < 32; ++i) {
            newLeafList.push(newLeaves[i]);
        }

        const tree = new MerkleTree(newLeafList);

        for (let proofSize = 1; proofSize <= 5; ++proofSize) {
            const newLeaf = crypto.randomBytes(32);
            const i = Math.floor(Math.random() * 32);
            const leaf = newLeaves[i];

            let proof = tree.getProof(i);
            const partialProof = proof.proof.slice(0, proofSize);

            // Create an instruction to replace the leaf
            const replaceIx = createReplaceIx(cmt, payer, newLeaf, {
                ...proof,
                proof: partialProof,
            });
            tree.updateLeaf(i, newLeaf);

            // Create an instruction to undo the previous replace, but using the now-outdated partialProof
            proof = tree.getProof(i);
            const replaceBackIx = createReplaceIx(cmt, payer, leaf, {
                ...proof,
                proof: partialProof,
            });
            tree.updateLeaf(i, leaf);
            await execute(provider, [replaceIx, replaceBackIx], [payerKeypair], true, true);
        }
    });
});
describe(`Having created a tree with 8 leaves`, () => {
    beforeEach(async () => {
        [cmtKeypair, offChainTree] = await createTreeOnChain(provider, payerKeypair, 1 << 3, {
            maxBufferSize: 8,
            maxDepth: 3,
        });
        cmt = cmtKeypair.publicKey;
    });
    it(`Attempt to replace a leaf beyond the tree's capacity`, async () => {
        // Ensure that this fails
        const outOfBoundsIndex = 8;
        const index = outOfBoundsIndex;
        const newLeaf = hash(payer.toBuffer(), Buffer.from(new BN(outOfBoundsIndex).toArray()));
        const node = offChainTree.leaves[outOfBoundsIndex - 1].node;
        const proof = offChainTree.getProof(index - 1).proof;

        const replaceIx = createReplaceIx(cmt, payer, newLeaf, {
            leaf: node,
            leafIndex: index,
            proof,
            root: offChainTree.root,
        });

        try {
            await execute(provider, [replaceIx], [payerKeypair]);
            throw Error('This replace instruction should have failed because the leaf index is OOB');
        } catch (_e) {}
    });
});
});


describe("token-distribution", () => {
  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.AnchorProvider.env());

const funder = anchor.web3.Keypair.generate();
const contractTokenAccount = anchor.web3.Keypair.generate();
const funderAuthority = anchor.web3.Keypair.generate();
const stateAccount = anchor.web3.Keypair.generate();
const whitelistAccount = anchor.web3.Keypair.generate();
const tokenProgram = TOKEN_PROGRAM_ID;
const systemProgram = web3.SystemProgram.programId;

// Constants for testing
const CLAIM_AMOUNT = 100;
const MERKLE_ROOT = new Uint8Array(32);
const MAX_TOTAL_CLAIM = 1000;
const MAX_NUM_NODES = 10;

it("Is initialized!", async () => {
    // Assuming the smart contract is deployed and you have its public key
    const contractPublicKey = new anchor.web3.PublicKey('FtgwkKXpsGS6tjC3ZFQmW65pasuca559K8yGSAkArNEp');
    
    const tx = await program.rpc.initialize(
      CLAIM_AMOUNT,
      MERKLE_ROOT,
      MAX_TOTAL_CLAIM,
      MAX_NUM_NODES,
      {
        accounts: {
          funder: funder.publicKey,
          contractTokenAccount: contractTokenAccount.publicKey,
          funderAuthority: funderAuthority.publicKey,
          state: stateAccount.publicKey,
          whitelist: whitelistAccount.publicKey,
          tokenProgram: tokenProgram,
          systemProgram: systemProgram,
        },
        instructions: [await program.account.whitelist.createInstruction(stateAccount)],
        signers: [funder, funderAuthority, stateAccount, whitelistAccount],
      }
    );
    // Ensure state account is properly initialized
    const state = await program.account.state.fetch(stateAccount.publicKey);
    assert.equal(state.claimAmount, CLAIM_AMOUNT);
    assert.deepStrictEqual(state.merkleRoot, MERKLE_ROOT);
    assert.equal(state.maxTotalClaim, MAX_TOTAL_CLAIM);
    assert.equal(state.maxNumNodes, MAX_NUM_NODES);
    assert.equal(state.totalAmountClaimed, 0);
    assert.equal(state.numNodesClaimed, 0);
    assert.deepStrictEqual(state.claimed, []);

    console.log("Your transaction signature", tx);
});

// Claim tokens by a whitelisted address
it("should allow whitelisted addresses to claim tokens", async () => {
  // Generate a whitelisted address
  const claimer = anchor.web3.Keypair.generate().publicKey;

  // Create a merkle proof
  const merkleProof = [crypto.randomBytes(32)];

  // Make the claim
  await program.rpc.claim(
    CLAIM_AMOUNT,
    merkleProof,
    {
      accounts: {
        claimer,
        claimerTokenAccount: anchor.web3.Keypair.generate().publicKey,
        contractTokenAccount: contractTokenAccount.publicKey,
        contractAuthority: funderAuthority.publicKey,
        state: stateAccount.publicKey,
        whitelist: whitelistAccount.publicKey,
        tokenProgram: tokenProgram,
      },
      signers: [],
    }
  );

  // Ensure state is updated
  const state = await program.account.state.fetch(stateAccount.publicKey);
  assert.equal(state.totalAmountClaimed, CLAIM_AMOUNT);
  assert.equal(state.numNodesClaimed, 1);
  assert.deepStrictEqual(state.claimed, [claimer]);
});

// Add addresses to the whitelist
it("should add addresses to the whitelist", async () => {
  // Generate and add 10 whitelisted addresses
  const whitelistedAddresses = [];
  for (let i = 0; i < 10; i++) {
    const address = anchor.web3.Keypair.generate().publicKey;
    whitelistedAddresses.push(address);

    await program.rpc.addWhitelisted(
      address,
      CLAIM_AMOUNT,
      {
        accounts: {
          whitelist: whitelistAccount.publicKey,
        },
        signers: [whitelistAccount],
      }
    );
  }
  // Verify that all addresses are whitelisted
  const whitelist = await program.account.whitelist.fetch(whitelistAccount.publicKey);
  assert.equal(whitelist.addresses.length, 10);
  for (let i = 0; i < 10; i++) {
    assert.ok(whitelist.addresses.includes(whitelistedAddresses[i]));
  }
});

// Fund the contract with tokens
it("should fund the contract with tokens", async () => {
  // Fund the contract with 1000 tokens
  await program.rpc.fundContract(
    1000,
    {
      accounts: {
        funder: funder.publicKey,
        contractTokenAccount: contractTokenAccount.publicKey,
        funderAuthority: funderAuthority.publicKey,
        tokenProgram: tokenProgram,
      },
      signers: [funder],
    }
  );

  // Ensure contract token account balance is updated
  const token = new Token(
    connection,
    contractTokenAccount.publicKey,
    TOKEN_PROGRAM_ID,
    funderAuthority
  );
  const balance = await token.getBalance(contractTokenAccount.publicKey);
  assert.equal(balance, 1000);
});


});