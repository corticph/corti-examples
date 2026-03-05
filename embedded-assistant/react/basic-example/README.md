# Corti Embedded Assistant - React Basic Example

Minimal React example showing how to integrate the Corti Embedded Assistant.

## What This Example Does

1. **Authenticates** with Corti using ROPC flow via backend
2. **Creates an interaction** with encounter details
3. **Navigates** to the session view
4. **Handles** events and errors from the embedded component

## What This Example Doesn't Cover

- Customisation
- Event handling
- Production error handling patterns

## Quick Start

1. Install dependencies:

```bash
npm install
```

2. Configure environment (copy `.env.example` to `.env` with your credentials)

3. Start both servers:

```bash
npm run dev
```

Opens on `http://localhost:5173` with backend at `http://localhost:3000`.

## Core Files

### Backend

- **[server.ts](server.ts)** - Express HTTP server with CORS for Vite dev server:
  - **Config endpoint** (`/api/config`) - Returns `baseUrl` constructed from `CORTI_ENVIRONMENT`
  - **Authentication endpoint** (`/api/auth`) - Implements ROPC flow using `@corti/sdk` to exchange user credentials for OAuth tokens
  - Runs on port 3000, separate from Vite dev server

### Frontend

- **[src/App.tsx](src/App.tsx)** - Root component coordinating data fetching:
  - **Suspense boundary** - Uses React 19's `use()` hook for async config and auth loading
  - **Data coordination** - Fetches config and auth in parallel via Suspense
  - **Error handling** - Displays authentication errors

- **[src/components/EmbeddedAssistant.tsx](src/components/EmbeddedAssistant.tsx)** - Main integration component:
  - **Component setup** - Uses `CortiEmbeddedReact` component with ref
  - **API access** - Gets API via `useCortiEmbeddedApi()` hook
  - **Authentication** - Calls `api.auth()` in `onReady` handler
  - **Interaction creation** - Creates encounter and navigates to session
  - **Event handling** - Handles `onReady`, `onEvent`, and `onError` callbacks

- **[src/lib/auth.ts](src/lib/auth.ts)** - Backend communication helpers:
  - **Config fetching** - Fetches baseUrl from `/api/config` endpoint
  - **Token fetching** - Fetches credentials from `/api/auth` endpoint
  - **Caching** - Implements promise cache to prevent duplicate requests

### Configuration

- **`.env`** - Corti credentials and environment configuration:
  - `CORTI_ENVIRONMENT`, `CORTI_TENANT_NAME`, `CORTI_CLIENT_ID` - Target environment and OAuth client
  - `CORTI_USER_EMAIL`, `CORTI_USER_PASSWORD` - End-user credentials for ROPC authentication

## Core API Flow

```typescript
// Get API access via hook
const api = useCortiEmbeddedApi(cortiRef);

// In onReady callback:
await api.auth(credentials);
const interaction = await api.createInteraction({ encounter: {...} });
await api.navigate(`/session/${interaction.id}`);
```
