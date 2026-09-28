import './components/trade-alert.js';
import type { TradeEvent } from './types/trade.js';
import type { CopyInstruction } from './types/copy.js';
import { WalletState } from './types/wallet.js';

console.log('POPUP SCRIPT LOADED');

const container = document.getElementById('trades');

if (!container) {
    throw new Error('Trade container not found');
}

const tradeContainer = container;

function renderTrade(
    trade: TradeEvent,
    walletState: WalletState | null
): void {
    const alert = document.createElement('trade-alert') as HTMLElement & {
        setTrade(
            trade: TradeEvent,
            walletState: WalletState | null
        ): void;
    };

    alert.setTrade(trade, walletState);

    alert.addEventListener('copy-trade', (event) => {
        const customEvent = event as CustomEvent<CopyInstruction>;

        console.log('Sending copy instruction:', customEvent.detail);

        chrome.runtime.sendMessage({
            type: 'copy-trade',
            data: customEvent.detail,
        });
    });

    alert.addEventListener('custom-trade', (event) => {
        const customEvent = event as CustomEvent<TradeEvent>;
        console.log('Custom trade requested:', customEvent.detail);
    });

    tradeContainer.appendChild(alert);
}

function renderWallet(wallet: WalletState | null): void {
    const walletContainer = document.getElementById('wallet');

    if (!walletContainer) {
        return;
    }

    if (!wallet) {
        walletContainer.textContent = 'Wallet unavailable';
        return;
    }

    walletContainer.innerHTML = `
        <div>
            <strong>Your Wallet</strong>
        </div>

        <div>
           ${Math.floor(wallet.solBalance * 10_000) / 10_000} SOL
        </div>
    `;
}

console.log('Requesting state from background');

chrome.runtime.sendMessage(
    { type: 'get-state' },
    (response) => {
        console.log('Background response:', response);

        if (!response) {
            console.error('No response from background worker');
            return;
        }

        renderWallet(response.walletState);

        for (const trade of response.trades) {
            console.log('Rendering trade:', trade);

            renderTrade(
                trade,
                response.walletState
            );
        }
    }
);