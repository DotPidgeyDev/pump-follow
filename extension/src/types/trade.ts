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