export interface TradeEvent {
    id: string;
    wallet: string;
    signature: string;

    side: 'buy' | 'sell';

    mint: string;
    symbol: string;

    tokenAmount: number;
    solAmount: number;
    usdValue: number;

    timestamp: number;
}

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

export interface CopyInstruction {
    tradeId: string;
    action: 'buy' | 'sell';
    amountType: 'usd' | 'percentage';
    amount: number;
}