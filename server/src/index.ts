import 'dotenv/config';

import { broadcast } from './websocket.js';
import { createFakeTrade } from './fake-trades.js';
import { getWalletState } from './wallet.js';
import { checkTrackedWallet } from './tracked-wallet.js';
console.log('Pump Copy Trader local server starting...');

function generateTrade(): void {
    const trade = createFakeTrade();

    console.log(
        `${trade.side.toUpperCase()} ${trade.symbol} $${trade.usdValue}`
    );

    broadcast('trade', trade);
}

async function broadcastWalletState(): Promise<void> {
    try {
        const wallet = await getWalletState();

        console.log(
            `Wallet balance: ${wallet.solBalance} SOL`
        );

        broadcast('wallet-state', wallet);
    } catch (error) {
        console.error(
            'Failed to retrieve wallet state:',
            error
        );
    }
}

async function pollTrackedWallet(): Promise<void> {
    try {
        await checkTrackedWallet();
    } catch (error) {
        console.error(
            'Tracked wallet polling failed:',
            error
        );
    }
}

generateTrade();

void broadcastWalletState();
void pollTrackedWallet();

setInterval(() => {
    void pollTrackedWallet();
}, 3000);
// setInterval(generateTrade, 5000);
setInterval(() => {
    void broadcastWalletState();
}, 25000);