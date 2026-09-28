import { ServerMessage } from "./types/server";
import { WalletState } from "./types/wallet";

const WS_URL = 'ws://localhost:8765';

let socket: WebSocket | null = null;

interface TradeEvent {
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

const trades: TradeEvent[] = [];
let walletState: WalletState | null = null;

function connect(): void {
    console.log(`Connecting to ${WS_URL}...`);

    socket = new WebSocket(WS_URL);

    socket.addEventListener('open', () => {
        console.log('Connected to local trade server');
    });

    socket.addEventListener('message', (event) => {
        const message = JSON.parse(event.data) as ServerMessage;

        if (message.type === 'trade') {
            const trade = message.data;

            console.log('Trade received:', trade);

            trades.unshift(trade);

            if (trades.length > 20) {
                trades.pop();
            }

            return;
        }

        if (message.type === 'wallet-state') {
            walletState = message.data;

            console.log('Wallet state received:', walletState);
        }

        if (message.type === 'copy-trade-accepted') {
            console.log(
                'Copy trade accepted by server:',
                message.data
            );

            return;
        }
    });

    socket.addEventListener('close', () => {
        console.log('Disconnected from local trade server');

        socket = null;
    });

    socket.addEventListener('error', (error) => {
        console.error('WebSocket error:', error);
    });
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === 'get-state') {
        sendResponse({
            trades,
            walletState,
        });

        return;
    }

    if (message.type === 'copy-trade') {
        if (!socket || socket.readyState !== WebSocket.OPEN) {
            console.error(
                'Cannot send copy instruction: WebSocket not connected'
            );
            return;
        }

        console.log(
            'Sending copy instruction to server:',
            message.data
        );

        socket.send(
            JSON.stringify({
                type: 'copy-trade',
                data: message.data,
            })
        );
    }
});

connect();