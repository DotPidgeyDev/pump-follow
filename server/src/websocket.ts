import { WebSocketServer, WebSocket } from 'ws';
import type { CopyInstruction } from './types';

const wss = new WebSocketServer({
    port: 8765,
});

wss.on('connection', (socket) => {
    console.log('Client connected');

    socket.on('message', (raw) => {
        try {
            const message = JSON.parse(raw.toString());

            if (message.type !== 'copy-trade') {
                return;
            }

            const instruction = validateCopyInstruction(message.data);

            console.log('Accepted copy instruction:', instruction);

            socket.send(
                JSON.stringify({
                    type: 'copy-trade-accepted',
                    data: instruction,
                })
            );
        } catch (error) {
            console.error('Invalid WebSocket message:', error);
        }
    });

    socket.on('close', () => {
        console.log('Client disconnected');
    });
});

console.log('WebSocket server listening on ws://localhost:8765');

export function broadcast(type: string, data: unknown): void {
    const message = JSON.stringify({
        type,
        data,
    });

    for (const client of wss.clients) {
        if (client.readyState === WebSocket.OPEN) {
            client.send(message);
        }
    }
}

function validateCopyInstruction(
    value: unknown,
): CopyInstruction {
    if (!value || typeof value !== 'object') {
        throw new Error('Copy instruction must be an object');
    }

    const instruction = value as Record<string, unknown>;

    if (
        typeof instruction.tradeId !== 'string' ||
        instruction.tradeId.length === 0
    ) {
        throw new Error('Invalid tradeId');
    }

    if (
        instruction.action !== 'buy' &&
        instruction.action !== 'sell'
    ) {
        throw new Error('Invalid action');
    }

    if (
        instruction.amountType !== 'usd' &&
        instruction.amountType !== 'percentage'
    ) {
        throw new Error('Invalid amountType');
    }

    if (
        typeof instruction.amount !== 'number' ||
        !Number.isFinite(instruction.amount)
    ) {
        throw new Error('Invalid amount');
    }

    if (instruction.action === 'buy') {
        if (instruction.amountType !== 'usd') {
            throw new Error('BUY instructions must use USD amounts');
        }

        if (instruction.amount <= 0) {
            throw new Error('BUY amount must be greater than 0');
        }
    }

    if (instruction.action === 'sell') {
        if (instruction.amountType !== 'percentage') {
            throw new Error('SELL instructions must use percentage amounts');
        }

        if (
            instruction.amount <= 0 ||
            instruction.amount > 100
        ) {
            throw new Error(
                'SELL percentage must be between 0 and 100',
            );
        }
    }

    return {
        tradeId: instruction.tradeId,
        action: instruction.action,
        amountType: instruction.amountType,
        amount: instruction.amount,
    };
}