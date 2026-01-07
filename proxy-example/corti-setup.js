import { CortiClient } from '@corti/sdk';

// Load configuration from environment variables
const ENVIRONMENT_ID = process.env.ENVIRONMENT_ID;
const TENANT_NAME = process.env.TENANT_NAME;
const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;

const cortiClient = new CortiClient({
    environment: ENVIRONMENT_ID,
    tenantName: TENANT_NAME,
    auth: {
        clientId: CLIENT_ID,
        clientSecret: CLIENT_SECRET,
    },
});

// Factory function to create/reuse Corti transcribe socket
const socketFactory = () => {
    let socket;

    return async () => {
        if (socket) {
            return socket;
        }

        socket = cortiClient.transcribe.connect();

        return socket;
    }
};

// Alternative approach: If you only need WebSocket proxying and don't use other Corti API calls,
// you can use CortiAuth with getToken() method and create WebSockets natively. This is a lighter
// solution that avoids initializing the full CortiClient.
//
// Note: When using native WebSocket, you must use native event handlers (socket.on('message', ...),
// socket.on('error', ...), etc.) instead of the SDK's event handlers.
//
// import { CortiAuth, CortiEnvironment } from '@corti/sdk';
// import WebSocket from 'ws';
//
// const auth = new CortiAuth({
//     environment: ENVIRONMENT_ID,
//     tenantName: TENANT_NAME,
//     auth: { clientId: CLIENT_ID, clientSecret: CLIENT_SECRET }
// });
//
// const socketFactory = () => {
//     let socket;
//
//     return async () => {
//         if (socket && socket.readyState === WebSocket.OPEN) {
//             return socket;
//         }
//
//         // Get scoped token for transcribe
//         const tokenResponse = await auth.getToken({ scopes: ['transcribe'] });
//
//         // Get WebSocket URL for the environment
//         // Option 1: Use CortiEnvironment enum (for 'eu' or 'us')
//         const env = ENVIRONMENT_ID === 'us' ? CortiEnvironment.Us : CortiEnvironment.Eu;
//         // Option 2: Construct manually for other environments
//         // const wssBase = `wss://api.${ENVIRONMENT_ID}.corti.app/audio-bridge/v2`;
//         const wsUrl = `${env.wss}/transcribe?tenant-name=${TENANT_NAME}&token=${tokenResponse.data.accessToken}`;
//
//         // Create native WebSocket connection
//         socket = new WebSocket(wsUrl);
//
//         return socket;
//     };
// };

export { cortiClient, socketFactory };

