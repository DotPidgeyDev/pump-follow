import WebSocket from 'ws';

const socket = new WebSocket('ws://localhost:8765');

socket.on('open', () => {
    console.log('Connected to local trade server');
});

socket.on('message', (data) => {
    const trade = JSON.parse(data.toString());

    console.log('Received trade:', trade);
});

socket.on('close', () => {
    console.log('Disconnected from local trade server');
});

socket.on('error', (error) => {
    console.error('WebSocket error:', error);
});