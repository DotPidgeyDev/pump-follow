export interface CopyInstruction {
    tradeId: string;

    action: 'buy' | 'sell';

    amountType: 'usd' | 'percentage';

    amount: number;
}