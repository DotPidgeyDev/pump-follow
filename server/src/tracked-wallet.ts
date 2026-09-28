import { rpcRequest } from './solana.js';
import type { TradeEvent } from './types.js';
import { broadcast } from './websocket.js';
import {
    getTokenMetadata,
} from './token-metadata.js';
import { getSolPrice } from './sol-price.js';

interface SignatureInfo {
    signature: string;
    slot: number;
    err: unknown;
    blockTime: number | null;
    confirmationStatus: string | null;
}

interface TokenBalance {
    accountIndex: number;
    mint: string;
    owner: string;
    uiTokenAmount: {
        amount: string;
        decimals: number;
        uiAmount: number | null;
        uiAmountString: string;
    };
}

interface ParsedInstruction {
    parsed?: {
        info?: {
            source?: string;
            destination?: string;
            lamports?: number;
            amount?: string;
            authority?: string;
            owner?: string;
            account?: string;
            mint?: string;
        };
        type?: string;
    };
    program?: string;
    programId?: string;
}

interface InnerInstructions {
    index: number;
    instructions: ParsedInstruction[];
}

interface ParsedTransaction {
    slot: number;
    blockTime: number | null;

    meta: {
        err: unknown;
        fee: number;
        preBalances: number[];
        postBalances: number[];
        preTokenBalances?: TokenBalance[];
        postTokenBalances?: TokenBalance[];
        innerInstructions?: InnerInstructions[];
        logMessages?: string[] | null;
    } | null;

    transaction: {
        message: {
            accountKeys: Array<{
                pubkey: string;
                signer: boolean;
                writable: boolean;
            }>;
            instructions: unknown[];
        };
    };
}

interface TokenDelta {
    mint: string;
    amount: number;
    decimals: number;
}

interface SolTransfer {
    source: string;
    destination: string;
    lamports: number;
    sol: number;
    type: string;
    program: string;
}

interface TradeCandidate {
    side: 'buy' | 'sell';
    mint: string;
    tokenAmount: number;
    solAmount: number;
}

const WSOL_MINT =
    'So11111111111111111111111111111111111111112';

function getWsolAccounts(
    transaction: ParsedTransaction
): Set<string> {
    const accounts = new Set<string>();

    const balances = [
        ...(transaction.meta?.preTokenBalances ?? []),
        ...(transaction.meta?.postTokenBalances ?? []),
    ];

    for (const balance of balances) {
        if (balance.mint !== WSOL_MINT) {
            continue;
        }

        const account =
            transaction.transaction.message
                .accountKeys[balance.accountIndex];

        if (account) {
            accounts.add(account.pubkey);
        }
    }

    return accounts;
}

const trackedWallet =
    process.env.TRACKED_WALLET_ADDRESS;

if (!trackedWallet) {
    throw new Error(
        'TRACKED_WALLET_ADDRESS is not configured.'
    );
}

const walletAddress: string =
    trackedWallet;

let latestSignature: string | null = null;
let initialized = false;

async function getRecentSignatures(): Promise<SignatureInfo[]> {
    return rpcRequest<SignatureInfo[]>(
        'getSignaturesForAddress',
        [
            walletAddress,
            {
                limit: 20,
                commitment: 'confirmed',
            },
        ]
    );
}

async function getTransaction(
    signature: string
): Promise<ParsedTransaction | null> {
    return rpcRequest<ParsedTransaction | null>(
        'getTransaction',
        [
            signature,
            {
                encoding: 'jsonParsed',
                commitment: 'confirmed',
                maxSupportedTransactionVersion: 0,
            },
        ]
    );
}

async function createTradeEvent(
    signature: SignatureInfo,
    trade: TradeCandidate
): Promise<TradeEvent> {
    const metadata =
        await getTokenMetadata(
            trade.mint
        );

    const solPrice =
        await getSolPrice();

    return {
        id: signature.signature,
        wallet: walletAddress,
        signature: signature.signature,
        side: trade.side,
        mint: trade.mint,
        symbol:
            metadata?.symbol ??
            trade.mint,
        tokenAmount:
            trade.tokenAmount,
        solAmount:
            trade.solAmount,
        usdValue:
            trade.solAmount * solPrice,
        timestamp:
            signature.blockTime
                ? signature.blockTime * 1000
                : Date.now(),
    };
}

function getTokenDeltas(
    transaction: ParsedTransaction,
    ownerAddress: string
): TokenDelta[] {
    const pre =
        transaction.meta?.preTokenBalances ?? [];

    const post =
        transaction.meta?.postTokenBalances ?? [];

    const balances = new Map<
        string,
        {
            pre: number;
            post: number;
            decimals: number;
        }
    >();

    for (const balance of pre) {
        if (balance.owner !== ownerAddress) {
            continue;
        }

        balances.set(balance.mint, {
            pre: Number(
                balance.uiTokenAmount.uiAmountString
            ),
            post: 0,
            decimals: balance.uiTokenAmount.decimals,
        });
    }

    for (const balance of post) {
        if (balance.owner !== ownerAddress) {
            continue;
        }

        const existing =
            balances.get(balance.mint);

        balances.set(balance.mint, {
            pre: existing?.pre ?? 0,
            post: Number(
                balance.uiTokenAmount.uiAmountString
            ),
            decimals: balance.uiTokenAmount.decimals,
        });
    }

    return [...balances.entries()]
        .map(([mint, balance]) => ({
            mint,
            amount:
                balance.post -
                balance.pre,
            decimals: balance.decimals,
        }))
        .filter(
            delta => delta.amount !== 0
        );
}

function getSolDelta(
    transaction: ParsedTransaction,
    ownerAddress: string
): number {
    const accountIndex =
        transaction.transaction.message.accountKeys.findIndex(
            account =>
                account.pubkey === ownerAddress
        );

    if (accountIndex === -1) {
        return 0;
    }

    const pre =
        transaction.meta?.preBalances[
            accountIndex
        ] ?? 0;

    const post =
        transaction.meta?.postBalances[
            accountIndex
        ] ?? 0;

    return (
        (post - pre) /
        1_000_000_000
    );
}

function getSolTransfers(
    transaction: ParsedTransaction
): SolTransfer[] {
    const transfers: SolTransfer[] = [];

    const wsolAccounts =
        getWsolAccounts(transaction);

    const innerInstructions =
        transaction.meta?.innerInstructions ?? [];

    for (const group of innerInstructions) {
        for (const instruction of group.instructions) {
            const parsed =
                instruction.parsed;

            if (!parsed) {
                continue;
            }

            const info =
                parsed.info;

            if (!info) {
                continue;
            }

            /*
             * Native SOL transfer.
             */
            if (
                instruction.program === 'system' &&
                parsed.type === 'transfer' &&
                info.source &&
                info.destination &&
                typeof info.lamports === 'number'
            ) {
                transfers.push({
                    source: info.source,
                    destination:
                        info.destination,
                    lamports:
                        info.lamports,
                    sol:
                        info.lamports /
                        1_000_000_000,
                    type: 'native',
                    program: 'system',
                });

                continue;
            }

            /*
             * WSOL transfer.
             */
            if (
                (
                    instruction.program ===
                        'spl-token' ||
                    instruction.programId ===
                        'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'
                ) &&
                (
                    parsed.type === 'transfer' ||
                    parsed.type ===
                        'transferChecked'
                ) &&
                info.source &&
                info.destination &&
                info.amount &&
                (
                    wsolAccounts.has(
                        info.source
                    ) ||
                    wsolAccounts.has(
                        info.destination
                    )
                )
            ) {
                transfers.push({
                    source: info.source,
                    destination:
                        info.destination,
                    lamports:
                        Number(info.amount),
                    sol:
                        Number(info.amount) /
                        1_000_000_000,
                    type: 'wsol',
                    program:
                        instruction.program ??
                        'spl-token',
                });
            }
        }
    }

    return transfers;
}

function inspectPrograms(
    transaction: ParsedTransaction
): void {
    const programs = new Set<string>();

    for (
        const instruction
        of transaction.transaction.message.instructions
    ) {
        const instructionRecord =
            instruction as {
                programId?: string;
            };

        if (instructionRecord.programId) {
            programs.add(
                instructionRecord.programId
            );
        }
    }

    for (
        const group
        of transaction.meta?.innerInstructions ?? []
    ) {
        for (
            const instruction
            of group.instructions
        ) {
            if (instruction.programId) {
                programs.add(
                    instruction.programId
                );
            }

            if (instruction.program) {
                programs.add(
                    instruction.program
                );
            }
        }
    }

    console.log('Programs involved:');

    for (const program of programs) {
        console.log(`  ${program}`);
    }
}

function inspectTransaction(
    transaction: ParsedTransaction
): void {
    console.log('\n==============================');
    console.log('Inspecting transaction');
    console.log('==============================');

    console.log(
        'Slot:',
        transaction.slot
    );

    console.log(
        'Block time:',
        transaction.blockTime
    );

    console.log(
        'Transaction error:',
        transaction.meta?.err
    );

    console.log(
        'Fee:',
        transaction.meta
            ? transaction.meta.fee / 1_000_000_000
            : null,
        'SOL'
    );

    console.log('\n[2] Inspecting wallet account...');

    const walletIndex =
        transaction.transaction.message.accountKeys
            .findIndex(
                account =>
                    account.pubkey ===
                    walletAddress
            );

    console.log(
        'Tracked wallet account index:',
        walletIndex
    );

    if (walletIndex !== -1) {
        console.log(
            'Tracked wallet native balances:',
            {
                pre:
                    transaction.meta?.preBalances[
                        walletIndex
                    ] ?? null,

                post:
                    transaction.meta?.postBalances[
                        walletIndex
                    ] ?? null,
            }
        );
    }

    console.log('\n[3] Getting SOL transfers...');

    const solTransfers =
        getSolTransfers(transaction);

    console.log(
        '[3] SOL transfers:',
        solTransfers
    );

    console.log('\n[4] Getting SOL delta...');

    const solDelta =
        getSolDelta(
            transaction,
            walletAddress
        );

    console.log(
        '[4] SOL delta:',
        solDelta
    );

    console.log('\n[5] Getting token deltas...');

    const tokenDeltas =
        getTokenDeltas(
            transaction,
            walletAddress
        );

    console.log(
        '[5] Token deltas:',
        tokenDeltas
    );

    /*
    * Detailed tracked-wallet token balances
    */
    console.log(
        '\n[6] Tracked wallet token balances:'
    );

    const preWalletTokenBalances =
        (
            transaction.meta
                ?.preTokenBalances ?? []
        ).filter(
            balance =>
                balance.owner ===
                walletAddress
        );

    const postWalletTokenBalances =
        (
            transaction.meta
                ?.postTokenBalances ?? []
        ).filter(
            balance =>
                balance.owner ===
                walletAddress
        );

    console.log(
        'PRE:',
        preWalletTokenBalances
    );

    console.log(
        'POST:',
        postWalletTokenBalances
    );

    console.log(
        '\n[7] Inspecting programs...'
    );

    inspectPrograms(transaction);

    console.log(
        '\n[8] Detecting trade...'
    );

    const trade =
        detectTrade(transaction);

    console.log(
        '[8] Trade:',
        trade
    );

    console.log(
        '\n=============================='
    );
}

function getOwnedTokenAccounts(
    transaction: ParsedTransaction,
    ownerAddress: string,
    mint: string
): Set<string> {
    const accounts = new Set<string>();

    const balances = [
        ...(transaction.meta?.preTokenBalances ?? []),
        ...(transaction.meta?.postTokenBalances ?? []),
    ];

    for (const balance of balances) {
        if (
            balance.owner !== ownerAddress ||
            balance.mint !== mint
        ) {
            continue;
        }

        const account =
            transaction.transaction.message
                .accountKeys[
                    balance.accountIndex
                ];

        if (account) {
            accounts.add(account.pubkey);
        }
    }

    return accounts;
}

function isWalletWsolAccount(
    transaction: ParsedTransaction,
    account: string,
    walletAccounts: Set<string>
): boolean {
    /*
     * Direct wallet address.
     */
    if (walletAccounts.has(account)) {
        return true;
    }

    /*
     * Check token balances for accounts owned
     * by the tracked wallet.
     */
    const balances = [
        ...(transaction.meta?.preTokenBalances ?? []),
        ...(transaction.meta?.postTokenBalances ?? []),
    ];

    for (const balance of balances) {
        if (
            balance.owner !== walletAddress ||
            balance.mint !== WSOL_MINT
        ) {
            continue;
        }

        const accountKey =
            transaction.transaction.message
                .accountKeys[
                    balance.accountIndex
                ];

        if (
            accountKey?.pubkey === account
        ) {
            return true;
        }
    }

    /*
     * The temporary WSOL account may not have
     * survived into the token balance arrays.
     *
     * Look for an initializeAccount /
     * initializeAccount3 instruction involving
     * this account and the tracked wallet.
     */
    const innerInstructions =
        transaction.meta?.innerInstructions ?? [];

    for (const group of innerInstructions) {
        for (const instruction of group.instructions) {
            const parsed =
                instruction.parsed;

            if (!parsed?.info) {
                continue;
            }

            const info =
                parsed.info;

            if (
                (
                    parsed.type ===
                        'initializeAccount' ||
                    parsed.type ===
                        'initializeAccount2' ||
                    parsed.type ===
                        'initializeAccount3'
                ) &&
                info.account === account &&
                (
                    info.owner ===
                    walletAddress ||
                    info.authority ===
                    walletAddress
                )
            ) {
                return true;
            }
        }
    }

    return false;
}

function findTradeSolAmount(
    transaction: ParsedTransaction,
    side: 'buy' | 'sell',
    transfers: SolTransfer[]
): number | null {
    const walletAccounts =
        getOwnedTokenAccounts(
            transaction,
            walletAddress,
            WSOL_MINT
        );

    const wsolTransfers =
        transfers.filter(
            transfer =>
                transfer.type === 'wsol' &&
                transfer.source !==
                    transfer.destination
        );

    if (side === 'sell') {
        /*
         * Normal case:
         *
         * Wallet sells tokens and receives WSOL.
         */
        const incoming =
            wsolTransfers.filter(
                transfer =>
                    isWalletWsolAccount(
                        transaction,
                        transfer.destination,
                        walletAccounts
                    )
            );

        if (incoming.length > 0) {
            const tradeTransfer =
                incoming.reduce(
                    (largest, current) =>
                        current.sol >
                        largest.sol
                            ? current
                            : largest
                );

            return tradeTransfer.sol;
        }

        /*
         * Fallback:
         *
         * Some swaps result in native SOL being
         * returned directly to the wallet instead
         * of an identifiable WSOL transfer.
         *
         * The wallet's SOL delta includes the
         * transaction fee, so add the fee back to
         * recover the gross SOL received.
         */
        const solDelta =
            getSolDelta(
                transaction,
                walletAddress
            );

        if (solDelta > 0) {
            const fee =
                (
                    transaction.meta?.fee ??
                    0
                ) / 1_000_000_000;

            return solDelta + fee;
        }

        return null;
    }

    /*
     * BUY:
     *
     * Wallet spends WSOL to acquire tokens.
     */
    if (side === 'buy') {
        const outgoing =
            wsolTransfers.filter(
                transfer =>
                    isWalletWsolAccount(
                        transaction,
                        transfer.source,
                        walletAccounts
                    )
            );

        if (outgoing.length > 0) {
            const tradeTransfer =
                outgoing.reduce(
                    (largest, current) =>
                        current.sol >
                        largest.sol
                            ? current
                            : largest
                );

            return tradeTransfer.sol;
        }

        return null;
    }

    return null;
}

function isLikelySwap(
    transaction: ParsedTransaction
): boolean {
    if (transaction.meta?.err) {
        return false;
    }

    const programs =
        new Set<string>();

    for (
        const instruction
        of transaction.transaction.message.instructions
    ) {
        const parsed =
            instruction as {
                programId?: string;
            };

        if (parsed.programId) {
            programs.add(
                parsed.programId
            );
        }
    }

    /*
     * Jupiter is currently the main swap route
     * we're seeing.
     */
    if (
        programs.has(
            'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4'
        )
    ) {
        return true;
    }

    return false;
}

function detectTrade(
    transaction: ParsedTransaction
): TradeCandidate | null {

    if (!isLikelySwap(transaction)) {
        console.log(
            'Transaction does not appear to be a swap.'
        );

        return null;
    }

    const tokenDeltas =
        getTokenDeltas(
            transaction,
            walletAddress
        );

    const solTransfers =
        getSolTransfers(
            transaction
        );

    /*
     * Ignore transactions where the wallet
     * didn't actually change a token balance.
     */
    if (tokenDeltas.length === 0) {
        return null;
    }

    /*
     * For now we expect exactly one meaningful
     * non-WSOL token delta for a simple swap.
     */
    const tradeTokenDeltas =
        tokenDeltas.filter(
            delta =>
                delta.mint !== WSOL_MINT
        );

    if (
        tradeTokenDeltas.length !== 1
    ) {
        console.log(
            'Could not identify a single traded token.'
        );

        return null;
    }

    const tokenDelta =
        tradeTokenDeltas[0];

    /*
     * Find WSOL flowing through the transaction.
     */
    if (solTransfers.length === 0) {
        console.log(
            'Token changed but no SOL/WSOL transfer was found.'
        );

        return null;
    }

    /*
     * For a SELL, the tracked wallet's token
     * balance decreases and SOL is received.
     *
     * For a BUY, the tracked wallet's token
     * balance increases and SOL is spent.
     *
     * We currently identify the trade amount by
     * looking for the WSOL movement involving the
     * swap route.
     */
    const side =
        tokenDelta.amount > 0
            ? 'buy'
            : 'sell';

    const solAmount =
        findTradeSolAmount(
            transaction,
            side,
            solTransfers
        );

    if (solAmount === null) {
        console.log(
            'Could not determine trade SOL amount.'
        );

        return null;
    }

    return {
        side,
        mint: tokenDelta.mint,
        tokenAmount:
            Math.abs(tokenDelta.amount),
        solAmount,
    };
}

export async function checkTrackedWallet(): Promise<void> {
    const signatures =
        await getRecentSignatures();

    if (signatures.length === 0) {
        return;
    }

    /*
     * On startup, establish a checkpoint without
     * replaying the wallet's previous history.
     */
    if (!initialized) {
        latestSignature =
            signatures[0].signature;

        initialized = true;

        console.log(
            'Tracked wallet monitor initialized at:',
            latestSignature
        );

        return;
    }

    /*
     * Find transactions newer than our checkpoint.
     */
    const newSignatures: SignatureInfo[] = [];

    for (const signature of signatures) {
        if (
            signature.signature ===
            latestSignature
        ) {
            break;
        }

        newSignatures.push(signature);
    }

    if (newSignatures.length === 0) {
        return;
    }

    /*
     * RPC returns newest -> oldest.
     * Process oldest -> newest.
     */
    newSignatures.reverse();

    for (const signature of newSignatures) {
        console.log(
            'New tracked-wallet transaction:',
            signature.signature
        );

        console.log(
            'Slot:',
            signature.slot
        );

        console.log(
            'Block time:',
            signature.blockTime
        );

        console.log(
            'Status:',
            signature.confirmationStatus
        );

        const transaction =
            await getTransaction(
                signature.signature
            );

        if (!transaction) {
            console.log(
                'Transaction data not available yet.'
            );

            /*
             * Don't advance the checkpoint past
             * a transaction we couldn't process.
             */
            return;
        }

        inspectTransaction(
            transaction
        );

        const trade =
            detectTrade(transaction);

        if (trade) {
            const tradeEvent =
                await createTradeEvent(
                    signature,
                    trade
                );

            console.log(
                'Detected trade:',
                tradeEvent
            );

            broadcast(
                'trade',
                tradeEvent
            );
        }

        /*
         * Only advance the checkpoint after
         * successfully retrieving/processing
         * this transaction.
         */
        latestSignature =
            signature.signature;
    }
}