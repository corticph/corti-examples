# Postman – Web API testing

Use this folder to test the SDK example web-api applications with Postman. The collection works with:

- **TypeScript Express Web API** — `sdk/typescript/express-web-api` (default port 3000)
- **.NET web-api** — `sdk/dotnet/web-api` (default port 5275), or the same app in Docker (port 8080)

## Setup

1. **Import the collection and environments**  
   In Postman: **Import** → select:
   - `WebApi.postman_collection.json`
   - The environment file(s) you need from `environments/`:
     - `JS.postman_environment.json` — for the Express app
     - `DotNet.postman_environment.json` — for .NET (dotnet run)
     - `DotNet-Docker.postman_environment.json` — for .NET in Docker

2. **Select an environment**  
   In the top-right environment dropdown, choose the server you’re running:
   - **Web API – JS (Express)** → `http://localhost:3000`
   - **Web API – .NET** → `http://localhost:5275`
   - **Web API – .NET (Docker)** → `http://localhost:8080`

3. **Start the web-api**  
   Run one of the example servers (see their READMEs for credentials and `npm run dev` / `dotnet run`). Then send requests from the **Web Api** collection.

All requests use the `{{host}}` variable from the selected environment, so switching environments points at a different server.

## Contents

| Path | Description |
|------|-------------|
| `WebApi.postman_collection.json` | Collection: token (client credentials, ROPC, refresh, auth code, PKCE), client-variants, interactions, recordings, transcripts, facts, codes, documents, templates, agents, stream, transcribe |
| `environments/` | Environment files with `host` set per server (JS, .NET, .NET Docker) |
| `globals/` | Optional workspace globals |
