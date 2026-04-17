# Corti Agent Chat Demo

A barebones Next.js demo showcasing how to build a chat interface with Corti's agent capabilities using A2A (Agent-to-Agent) streaming and the Vercel AI SDK.

## What This Example Demonstrates

This example shows how to:

- **Initialize a Corti agent** using the `@corti/sdk` package
- **Use the singleton pattern** to create an agent once on server startup and reuse it
- **Stream agent responses** in real-time using `@a2a-js/sdk`
- **Integrate with Vercel AI SDK** using `@corti/ai-sdk-adapter` to bridge A2A streams with AI SDK
- **Build a chat UI** with React using AI SDK's `useChat` hook for seamless streaming
- **Handle errors gracefully** with user-facing error messages

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         Frontend (React)                        │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │  app/page.tsx                                              │ │
│  │  • Uses AI SDK's useChat hook for state management         │ │
│  │  • Displays messages in real-time as they stream           │ │
│  │  • Handles user input and error states                     │ │
│  │  • Leverages DefaultChatTransport for streaming            │ │
│  └────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                              ↓ HTTP POST
                              ↓ /api/chat
┌─────────────────────────────────────────────────────────────────┐
│                    Backend API Route (Next.js)                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │  app/api/chat/route.ts                                     │ │
│  │  • Receives messages from frontend                         │ │
│  │  • Gets singleton agent instance from lib/agent.ts         │ │
│  │  • Uses buildParams from @corti/ai-sdk-adapter             │ │
│  │  • Calls sendMessageStream on A2A client                   │ │
│  │  • Uses toUIMessageStream to convert A2A to UI format      │ │
│  │  • Returns streaming response via createUIMessageStream    │ │
│  └────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                              ↓
                              ↓ Uses
┌─────────────────────────────────────────────────────────────────┐
│                    Agent Singleton Module                       │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │  lib/agent.ts                                              │ │
│  │  • Initializes CortiClient with credentials                │ │
│  │  • Creates agent once on server startup                    │ │
│  │  • Uses ClientFactory to create A2A client                 │ │
│  │  • Exports client for reuse across all requests            │ │
│  └────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                              ↓
                              ↓ Communicates with
┌─────────────────────────────────────────────────────────────────┐
│                         Corti Platform                          │
│  • Agent execution and processing                               │
│  • A2A protocol for real-time streaming                         │
│  • Experts and capabilities integration                         │
└─────────────────────────────────────────────────────────────────┘
```

## Prerequisites

- **Node.js** 20.9 or higher
- **Corti account** with API credentials
  - Get credentials from [https://console.corti.app](https://console.corti.app)
  - You'll need: Tenant Name, Client ID, and Client Secret

## Setup Instructions

1. **Clone or navigate to this directory**

   ```bash
   cd agents/react/next-agent-chat
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Configure environment variables**

   Copy the example environment file and fill in your Corti credentials:

   ```bash
   cp .env.example .env
   ```

   Edit `.env` and add your credentials:

   ```env
   TENANT=your-tenant-name
   CLIENT_ID=your-client-id
   CLIENT_SECRET=your-client-secret
   ENVIRONMENT=eu  # or "us" for US region
   ```

   > ⚠️ **Security Note**: Never commit your `.env` file to version control. The `.env.example` file is provided as a template only.

4. **Run the development server**

   ```bash
   npm run dev
   ```

5. **Open your browser**

   Navigate to [http://localhost:3000](http://localhost:3000)

6. **Start chatting!**

   Type a message in the input field and press Enter. The agent will respond in real-time with streaming text.

## Project Structure

```
next-agent-chat/
├── app/
│   ├── api/
│   │   └── chat/
│   │       └── route.ts          # Chat API endpoint (handles streaming)
│   ├── layout.tsx                # Root layout with metadata
│   ├── page.tsx                  # Main chat UI (uses useChat hook)
│   └── globals.css               # Tailwind CSS imports
├── lib/
│   └── agent.ts                  # Agent singleton initialization
├── .env.example                  # Environment variables template
├── package.json                  # Dependencies and scripts
├── tsconfig.json                 # TypeScript configuration
├── next.config.ts                # Next.js configuration
├── biome.json                    # Linting and formatting config
├── postcss.config.mjs            # PostCSS configuration for Tailwind
└── README.md                     # This file
```

### Key Files Explained

#### `lib/agent.ts` - Agent Singleton

This module creates a Corti agent **once when the server starts** and exports it for reuse. Using a singleton pattern is more efficient than creating a new agent for each request.

**Key concepts:**
- Initializes `CortiClient` with OAuth credentials (client credentials flow)
- Creates an ephemeral agent that's automatically cleaned up
- Uses `ClientFactory` from `@a2a-js/sdk/client` to create the A2A client
- Calls `createFromUrl()` to initialize the client from the agent's base URL
- Caches the agent promise to prevent multiple initializations

#### `app/api/chat/route.ts` - Chat API Route

This Next.js API route handles incoming chat messages and streams responses back to the frontend.

**Key concepts:**
- Receives messages from the frontend via POST request
- Gets the singleton agent instance (not creating a new one)
- Uses `buildParams()` from `@corti/ai-sdk-adapter` to convert UI messages to A2A format
- Calls `sendMessageStream()` on the A2A client to get an async generator  
- Uses `toUIMessageStream()` to convert A2A events to UI message chunks
- Returns streaming responses via `createUIMessageStreamResponse()`

#### `app/page.tsx` - Chat UI

The main chat interface built with React using the AI SDK's `useChat` hook.

**Key concepts:**
- Uses `useChat` hook from `@ai-sdk/react` for complete state management
- Calls `sendMessage()` to send user input to `/api/chat` endpoint
- Receives `UIMessage` objects with a `parts` array structure
- Extracts text content from message parts for display
- Leverages `status` from `useChat` for loading states ('ready', 'streaming', etc.)
- Automatic error handling via the `error` property from `useChat`
- Styled with Tailwind CSS.

## Key Concepts

### What is A2A (Agent-to-Agent)?

A2A is Corti's protocol for real-time communication with agents. It enables:
- **Streaming responses** - Text appears in real-time as the agent generates it
- **Tool usage** - Agents can call tools and return results
- **Context management** - Maintain conversation state across multiple turns

### Why Use the AI SDK Adapter?

The `@corti/ai-sdk-adapter` package acts as a bridge:
- **Corti side**: Uses A2A protocol for agent communication
- **AI SDK side**: Converts A2A events to `UIMessage` format
- **Benefit**: Seamlessly use AI SDK's powerful `useChat` hook with Corti's agent capabilities
- **Developer experience**: Write less code - AI SDK handles streaming, state management, and error handling

### Singleton Pattern for Agents

Creating an agent on every request is inefficient. This demo uses a singleton pattern:

1. **First request**: Agent is created and cached
2. **Subsequent requests**: Same agent is reused
3. **Benefits**: Faster response times, lower resource usage, more cost-effective

## Available Scripts

- **`npm run dev`** - Start development server on [http://localhost:3000](http://localhost:3000)
- **`npm run build`** - Build the application for production
- **`npm start`** - Start the production server (requires `npm run build` first)
- **`npm run lint`** - Run Biome linter and formatter checks
- **`npm run lint:fix`** - Fix linting and formatting issues automatically
- **`npm run format`** - Format code with Biome

## Troubleshooting

### Agent initialization fails

**Error**: `Missing required environment variable: TENANT`

**Solution**: Make sure you've copied `.env.example` to `.env` and filled in all required values.

### Authentication errors

**Error**: `401 Unauthorized` or `422 Unprocessable Content` authentication failures

**Solution**: 
- Verify your `CLIENT_ID` and `CLIENT_SECRET` are correct
- Check that your credentials have the necessary permissions to create agents
- Ensure the `ENVIRONMENT` matches your account region (eu or us)

### No response from agent

**Problem**: Messages send but no response appears

**Solution**:
- Check the browser console and server logs for errors
- Verify the agent was created successfully (check server logs on startup)

## Related Documentation

- **Corti SDK**: [https://docs.corti.ai/sdk/overview](https://docs.corti.ai/get_started/welcome)
- **Corti SDK NPM**: [https://www.npmjs.com/package/@corti/sdk](https://www.npmjs.com/package/@corti/sdk)
- **A2A JS SDK**: [https://www.npmjs.com/package/@a2a-js/sdk](https://www.npmjs.com/package/@a2a-js/sdk)
- **Corti AI SDK Adapter**: [https://github.com/corti-ai/corti-ai-sdk-adapter](https://github.com/corti-ai/corti-ai-sdk-adapter)
- **Vercel AI SDK**: [https://sdk.vercel.ai/docs](https://sdk.vercel.ai/docs)
- **Next.js Documentation**: [https://nextjs.org/docs](https://nextjs.org/docs)

## License

This example is part of the Corti examples repository. See the main repository README for license information.
