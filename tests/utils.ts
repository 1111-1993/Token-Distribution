import { AnchorProvider } from '@coral-xyz/anchor';
import { Keypair, SendTransactionError, Signer, Transaction, TransactionInstruction } from '@solana/web3.js';
import * as crypto from 'crypto';

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

/// Wait for a transaction of a certain id to confirm and optionally log its messages
export async function confirmAndLogTx(provider: AnchorProvider, txId: string, verbose = false) {
    const tx = await provider.connection.confirmTransaction(txId, 'confirmed');
    if (tx.value.err || verbose) {
        console.log((await provider.connection.getConfirmedTransaction(txId, 'confirmed'))!.meta!.logMessages);
    }
    if (tx.value.err) {
        console.log('Transaction failed');
        throw new Error(JSON.stringify(tx.value.err));
    }
}

/// Execute a series of instructions in a txn
export async function execute(
    provider: AnchorProvider,
    instructions: TransactionInstruction[],
    signers: Signer[],
    skipPreflight = false,
    verbose = false
): Promise<string> {
    let tx = new Transaction();
    instructions.map(ix => {
        tx = tx.add(ix);
    });

    let txid: string | null = null;
    try {
        txid = await provider.sendAndConfirm!(tx, signers, {
            skipPreflight,
        });
    } catch (e) {
        if (e instanceof SendTransactionError) {
            console.log('Tx error!', e.logs);
	}
        throw e;
    }

    if (verbose && txid) {
        console.log((await provider.connection.getConfirmedTransaction(txid, 'confirmed'))!.meta!.logMessages);
    }

    return txid;
}

export async function createTreeOnChain(
    provider: AnchorProvider,
    payer: Keypair,
    numLeaves: number,
    depthSizePair: ValidDepthSizePair,
    canopyDepth = 0
): Promise<[Keypair, MerkleTree]> {
    const cmtKeypair = anchor.web3.Keypair.generate();

    const leaves = Array(2 ** depthSizePair.maxDepth).fill(Buffer.alloc(32));
    for (let i = 0; i < numLeaves; i++) {
        leaves[i] = crypto.randomBytes(32);
    }
    const tree = new MerkleTree(leaves);

    const allocAccountIx = await createAllocTreeIx(
        provider.connection,
        cmtKeypair.publicKey,
        payer.publicKey,
        depthSizePair,
        canopyDepth
    );

    const ixs = [allocAccountIx, createInitEmptyMerkleTreeIx(cmtKeypair.publicKey, payer.publicKey, depthSizePair)];

    const txId = await execute(provider, ixs, [payer, cmtKeypair]);
    if (canopyDepth) {
        await confirmAndLogTx(provider, txId as string);
    }

    if (numLeaves) {
        const nonZeroLeaves = leaves.slice(0, numLeaves);
        let appendIxs: TransactionInstruction[] = nonZeroLeaves.map(leaf => {
            return createAppendIx(cmtKeypair.publicKey, payer.publicKey, leaf);
        });
        while (appendIxs.length) {
            const batch = appendIxs.slice(0, 5);
            await execute(provider, batch, [payer]);
            appendIxs = appendIxs.slice(5);
        }
    }
    return [cmtKeypair, tree];
}

export async function createEmptyTreeOnChain(
    provider: AnchorProvider,
    payer: Keypair,
    depthSizePair: ValidDepthSizePair,
    canopyDepth = 0
): Promise<Keypair> {
    const cmtKeypair = anchor.web3.Keypair.generate();
    const allocAccountIx = await createAllocTreeIx(
        provider.connection,
        cmtKeypair.publicKey,
        payer.publicKey,
        depthSizePair,
        canopyDepth
    );

    const ixs = [allocAccountIx, createInitEmptyMerkleTreeIx(cmtKeypair.publicKey, payer.publicKey, depthSizePair)];

    const txId = await execute(provider, ixs, [payer, cmtKeypair]);
    await confirmAndLogTx(provider, txId as string);

    return cmtKeypair;
}