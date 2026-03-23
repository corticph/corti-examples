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

The .NET build fails fast if `WebAssets/dist` has not been built yet.

## Expected Behavior

After clicking `Authenticate`, the app should:

- request tokens from Corti auth
- load the embedded assistant in WebView2
- create an interaction
- navigate to the new session

The Authenticate button stays disabled until WebView2 is ready. Microphone permission is granted only for the trusted assistant origins used by the sample.
DevTools are enabled only in Debug builds.

## Troubleshooting

- Missing `.env`:
  Create `.env` from `.env.example` in the project root.
- Missing config keys:
  The app will fail fast and list the required keys.
- Missing built frontend:
  Run `npm install` and `npm run build` in `WebAssets` before running `dotnet run`.
- Frontend changes not showing up:
  Rebuild `WebAssets` before running the WPF app.
- Session crashes after navigation:
  Verify your `.env` values and rebuild the frontend before retrying.
