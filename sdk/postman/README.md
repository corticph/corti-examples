# Postman – Web API testing

Use this folder to test the SDK example web-api applications (JS/Express and .NET) with Postman.

## Setup

1. **Import the collection and environments**  
   In Postman: **Import** → select:
   - `WebApi.postman_collection.json` (collection)
   - All files in `environments/` (JS, .NET, .NET Docker)

2. **Select an environment**  
   In the top-right environment dropdown, choose the app you’re running:
   - **Web API – JS (Express)** → `http://localhost:3000` (Express app from `sdk/typescript/express-web-api`)
   - **Web API – .NET** → `http://localhost:5275` (dotnet run from `sdk/dotnet/web-api`)
   - **Web API – .NET (Docker)** → `http://localhost:8080` (same app in Docker)

3. **Start the web-api**  
   Run one of the example servers (see their READMEs for credentials and commands), then send requests from the **Web Api** collection.

## Contents

| Path | Description |
|------|-------------|
| `WebApi.postman_collection.json` | Collection of endpoints (interactions, recordings, token, etc.) |
| `environments/` | Environment files with `host` set per server (JS, .NET, .NET Docker) |
| `globals/` | Optional workspace globals |

All requests use the `{{host}}` variable from the selected environment, so switching environments is enough to point at a different server.
