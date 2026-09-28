import type { TradeEvent } from './types.js';

export function createFakeTrade(): TradeEvent {
    const isBuy = Math.random() > 0.3;

    return {
        id: crypto.randomUUID(),

        wallet: 'ABC123...FAKE',
        signature: crypto.randomUUID(),

        side: isBuy ? 'buy' : 'sell',

        mint: 'FAKE123...PUMP',
        symbol: 'BONK',

        tokenAmount: 125000,
        solAmount: 0.15,
        usdValue: 25.42,

        timestamp: Date.now(),
    };
}