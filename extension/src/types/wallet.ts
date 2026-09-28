export interface TokenBalance {
    mint: string;
    symbol: string;
    amount: number;
    decimals: number;
}

export interface WalletState {
    address: string;
    solBalance: number;
    tokens: TokenBalance[];
    updatedAt: number;
}