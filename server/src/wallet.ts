import type {
    TokenBalance,
    WalletState,
} from './types.js';
import { rpcRequest } from './solana.js';

const walletAddress =
    process.env.MY_WALLET_ADDRESS;

interface BalanceResult {
    value: number;
}

interface TokenAccount {
    account: {
        data: {
            parsed: {
                info: {
                    mint: string;
                    tokenAmount: {
                        amount: string;
                        decimals: number;
                        uiAmount: number | null;
                    };
                };
            };
        };
    };
}

interface TokenAccountsResult {
    value: TokenAccount[];
}

export async function getWalletState(): Promise<WalletState> {
    if (!walletAddress) {
        throw new Error(
            'MY_WALLET_ADDRESS is not configured.'
        );
    }

    const balance = await rpcRequest<BalanceResult>(
        'getBalance',
        [
            walletAddress,
            {
                commitment: 'confirmed',
            },
        ]
    );

    const tokenAccounts =
        await rpcRequest<TokenAccountsResult>(
            'getTokenAccountsByOwner',
            [
                walletAddress,
                {
                    programId:
                        'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
                },
                {
                    encoding: 'jsonParsed',
                    commitment: 'confirmed',
                },
            ]
        );

    const tokens: TokenBalance[] =
        tokenAccounts.value
            .map((account) => {
                const info =
                    account.account.data.parsed.info;

                return {
                    mint: info.mint,
                    symbol: info.mint,
                    amount: info.tokenAmount.uiAmount ?? 0,
                    decimals: info.tokenAmount.decimals,
                };
            })
            .filter((token) => token.amount > 0);

    return {
        address: walletAddress,
        solBalance: balance.value / 1_000_000_000,
        tokens,
        updatedAt: Date.now(),
    };
}