/**
 * WebSocket Proxy Server for Corti API
 * 
 * Proxies WebSocket connections from clients to the Corti transcription service.
 * Requires authentication via proxy-auth-token query parameter.
 */

import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import WebSocket from 'ws';
import { socketFactory } from './corti-setup.js';

const app = express();
const server = createServer(app);

const wss = new WebSocketServer({
    noServer: true,  // Don't auto-handle upgrades, we handle them manually
    path: '/proxy'  // Clients connect to: ws://localhost:{port}/proxy
});

const PROXY_PORT = process.env.PORT || 3001;

// Authenticate WebSocket connections - require proxy-auth-token query parameter
server.on('upgrade', (request, socket, head) => {
    const url = new URL(request.url, `http://${request.headers.host}`);
    const authToken = url.searchParams.get('proxy-auth-token');

    // Reject connection if missing auth token
    if (!authToken) {
        socket.destroy();
        return;
    }

    // Pass the upgrade to WebSocket server
    wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
    });
});

wss.on('connection', async function connection(clientWs, req) {
    try {
        const getTranscribeSocket = socketFactory();

        // Forward messages from client to Corti
        clientWs.on('message', async (data, isBinary) => {
            (await getTranscribeSocket()).send(isBinary ? data : data.toString());
        });

        // Forward messages from Corti to Client
        // We access the underlying socket directly (.socket.addEventListener) instead of using the SDK's
        // .on('message') handler because the SDK parses messages into structured objects. For proxying,
        // we need the raw message data to forward to the client. If you're using native WebSockets
        // (see the alternative approach in corti-setup.js), you would use on('message', ...) instead.
        (await getTranscribeSocket()).socket.addEventListener('message', (data) => {
            if (clientWs.readyState === WebSocket.OPEN) {
                clientWs.send(data.data);
            }
        });

        // Handle Corti connection opened
        (await getTranscribeSocket()).on('open', () => {
            // Do something if needed
        });

        // Handle Corti connection errors
        (await getTranscribeSocket()).on('error', (error) => {
            if (clientWs.readyState === WebSocket.OPEN) {
                clientWs.close(1011, error.message);
            }
        });

        // Handle Corti connection close
        (await getTranscribeSocket()).on('close', () => {
            if (clientWs.readyState === WebSocket.OPEN) {
                clientWs.close();
            }
        });

        // Handle client connection errors
        clientWs.on('error', async (error) => {
            (await getTranscribeSocket()).close()
        });

        // Clean up on client disconnect
        clientWs.on('close', async () => {
            (await getTranscribeSocket()).close()
        });

    } catch (error) {
        if (clientWs.readyState === WebSocket.OPEN) {
            clientWs.close(1011, 'Proxy setup error');
        }
    }
});

// Serve static files from public directory
app.use(express.static('public'));

// Serve test page at root
app.get('/', (req, res) => {
    res.sendFile('test.html', { root: './public' });
});

server.listen(PROXY_PORT, () => {
    console.log(`🚀 Simple WebSocket Proxy Server running on http://localhost:${PROXY_PORT}`);
});
