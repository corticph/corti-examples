# Corti Embedded Assistant WPF Example

This example shows how to host `@corti/embedded-web` inside a WPF application using WebView2.

The flow mirrors the vanilla TypeScript example:
- load the embedded assistant
- authenticate with Corti
- create an interaction
- navigate to the session
- surface events and errors back to the host app

## Prerequisites

- .NET 10 SDK
- Node.js LTS
- WebView2 Runtime installed on Windows

## Configuration

This example uses a project-local `.env` file loaded with `DotNetEnv`.

1. Copy `.env.example` to `.env`
2. Fill in the values for your Corti environment

Required keys:

```env
CORTI_ENVIRONMENT=
CORTI_TENANT_NAME=
CORTI_CLIENT_ID=
CORTI_USER_EMAIL=
CORTI_USER_PASSWORD=
```

## Run

Build the frontend:

```powershell
cd WebAssets
npm install
npm run build
cd ..
```

Run the WPF app:

```powershell
dotnet run
```

## Expected Behavior

After clicking `Authenticate`, the app should:

- request tokens from Corti auth
- load the embedded assistant in WebView2
- create an interaction
- navigate to the new session

Microphone permission is granted by the WebView2 host when the embedded app requests it.

## Troubleshooting

- Missing `.env`:
  Create `.env` from `.env.example` in the project root.
- Missing config keys:
  The app will fail fast and list the required keys.
- Frontend changes not showing up:
  Rebuild `WebAssets` before running the WPF app.
- Session crashes after navigation:
  Verify your `.env` values and rebuild the frontend before retrying.
