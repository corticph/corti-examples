# Corti Embedded Assistant - Vanilla TypeScript Basic Example

Minimal vanilla TypeScript example showing how to integrate the Corti Embedded Assistant using Web Components.

## What This Example Does

1. **Authenticates** with Corti using ROPC flow via backend
2. **Configures** app-level UI and interaction options using the current Embedded API
3. **Creates an interaction** with encounter details
4. **Navigates** to the session view
5. **Handles** events and errors from the embedded component

## What This Example Doesn't Cover

- Customisation
- Advanced event handling
- Production error handling patterns
- State management

## Quick Start

1. Install dependencies:

```bash
npm install
```

2. Configure environment (copy `.env.example` to `.env` with your credentials)

3. Start development:

```bash
npm run dev
```

This starts both the TypeScript compiler in watch mode and the server. Opens on `http://localhost:8011` with:

- Auto-compilation of TypeScript files on changes
- Auto-restart of server on file changes

## Core Files

### Backend

- **[server.ts](server.ts)** - Express HTTP server serving static files and API:
  - **Root endpoint** (`/`) - Serves `index.html` with injected `baseUrl` from `CORTI_ENVIRONMENT`
  - **Static files** - Serves compiled JS and CSS from `public/` directory
  - **Library endpoint** (`/lib/embedded-web`) - Serves `@corti/embedded-web` bundle from `node_modules`
  - **Authentication endpoint** (`/api/auth`) - Implements ROPC flow using `@corti/sdk` to exchange user credentials for OAuth tokens
  - Auto-restarts on changes to `server.ts`, `index.html`, or `.env` (via `tsx watch`)
  - Runs on port 8011

### Frontend

- **[index.html](index.html)** - Main HTML page:
  - **Import map** - Maps `@corti/embedded-web` to the served bundle
  - **Web component** - `<corti-embedded>` element with `baseUrl` and `visibility` attributes
  - **Status display** - Shows loading/success/error states
  - Server injects `baseUrl` by replacing `{{baseUrl}}` placeholder

- **[public/app.ts](public/app.ts)** - Main application logic:
  - **Component access** - Gets `<corti-embedded>` element by ID and casts to API type
  - **Readiness check** - Waits for the `embedded.ready` event before starting API calls
  - **Authentication** - Calls `corti.auth()` with credentials from `/api/auth`
  - **App configuration** - Calls `corti.configureApp()` for app-level UI options
  - **Interaction options** - Calls `corti.setInteractionOptions()` before creating the interaction
  - **Interaction creation** - Creates encounter with `corti.createInteraction()`
  - **Navigation** - Calls `corti.navigate()` to session view
  - **Error handling** - Listens for `error` events and displays status
  - Auto-compiles to `public/app.js` in watch mode during development

### Configuration

- **`.env`** - Corti credentials and environment configuration:
  - `CORTI_ENVIRONMENT`, `CORTI_TENANT_NAME`, `CORTI_CLIENT_ID` - Target environment and OAuth client
  - `CORTI_USER_EMAIL`, `CORTI_USER_PASSWORD` - End-user credentials for ROPC authentication

### Build

- **[tsconfig.json](tsconfig.json)** - TypeScript configuration for ES2020 target
- **`npm run dev`** - Runs `tsc --watch` (client) and `tsx watch` (server) concurrently
- **`npm run build`** - One-time compilation of TypeScript to JavaScript (for production)

## Core API Flow

```typescript
// Get embedded element reference
const corti = document.getElementById("assistant") as CortiEmbeddedElement;

const readyPromise = waitForReady(corti);
const authPromise = fetch("/api/auth").then((response) => response.json());

const [, credentials] = await Promise.all([readyPromise, authPromise]);

await corti.auth(credentials);
await corti.configureApp({
  ui: {
    interactionTitle: true,
    aiChat: true,
    documentFeedback: true,
    navigation: true,
  },
});
await corti.setInteractionOptions({
  mode: {
    fallback: "in-person",
    options: ["in-person", "virtual"],
  },
  documents: {
    actions: {
      sync: true,
    },
  },
});
const interaction = await corti.createInteraction({ encounter: {...} });
await corti.navigate(`/session/${interaction.id}`);

// Handle errors
corti.addEventListener("error", (event: any) => {
  console.error(event.detail?.message);
});
```

## Development Workflow

1. Run `npm run dev` to start both watchers
2. Edit TypeScript in `public/app.ts` - automatically compiles to `public/app.js`
3. Edit `server.ts`, `index.html`, or `.env` - server auto-restarts
4. Refresh browser to see changes
