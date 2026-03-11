# Corti SDK Examples API

Minimal ASP.NET Core API that demonstrates the Corti SDK (token, interactions, recordings, transcripts, facts, codes, templates, agents, documents).

## Prerequisites

- [.NET 9 SDK](https://dotnet.microsoft.com/download/dotnet/9.0)

## How to run

From the repo root:

```bash
cd sdk/dotnet/web-api
dotnet run
```

Or run from your IDE (e.g. Visual Studio / Rider / VS Code) using the **http** or **https** launch profile.

- **HTTP:** `http://localhost:5275`
- **HTTPS:** `https://localhost:7091` (and `http://localhost:5275`)

**Which port?** If you use **`dotnet run`** (or the IDE), the app listens on **5275** (HTTP) or **7091** (HTTPS). Use `http://localhost:5275/interactions`, not 8080. Port **8080** is only used when you run the app **inside Docker** (see below).

## Run with Docker

From `sdk/dotnet/web-api`:

```bash
docker build -t corti-examples-api .
docker run -p 8080:8080 --env-file .env corti-examples-api
```

Or pass env vars explicitly: `docker run -p 8080:8080 -e CORTI__TENANTNAME=... -e CORTI__CLIENTID=... -e CORTI__CLIENTSECRET=... corti-examples-api`.

**Important:** `-p 8080:8080` publishes the container port to the host. Without it, you'll get `ECONNREFUSED` on localhost:8080.

The API listens on **port 8080** inside the container. Use `http://localhost:8080/interactions` (and similar) on the host. Pass Corti credentials via environment variables (as above) or with an `--env-file`; the image does not include `.env` or `appsettings.Development.json`.

**`connect ECONNREFUSED 127.0.0.1:8080`?** Either (1) you're running with `dotnet run` — use **port 5275**, e.g. `http://localhost:5275/interactions`; or (2) you're using Docker — ensure the container is running (`docker ps`) and you started it with `-p 8080:8080`. If the container exits, run `docker logs <container_id>` to see why.

## Parameters you need to set

The API needs Corti credentials to call the Corti API. Set these **before** running:

| Parameter   | Description                    | Required |
|------------|--------------------------------|----------|
| TenantName | Your Corti tenant name         | Yes      |
| ClientId   | OAuth2 client ID (client credentials) | Yes |
| ClientSecret | OAuth2 client secret          | Yes      |
| Environment | `us` or `eu` (Corti region)   | No (default: `us`) |

You can provide them in **any one** of these ways (later sources override earlier):

1. **appsettings.json / appsettings.Development.json**  
   Use the `Corti` section:
   ```json
   "Corti": {
     "TenantName": "your-tenant",
     "ClientId": "your-client-id",
     "ClientSecret": "your-client-secret",
     "Environment": "us"
   }
   ```

2. **Environment variables**  
   Use double underscore for the `Corti` section:
   - `CORTI__TENANTNAME`
   - `CORTI__CLIENTID`
   - `CORTI__CLIENTSECRET`
   - `CORTI__ENVIRONMENT` (optional, default `us`)

   You can set these in `Properties/launchSettings.json` (per profile), in your shell, or in your host environment.

3. **.env or .env.local** (in `sdk/dotnet/web-api`)  
   Same keys as environment variables, e.g.:
   ```
   CORTI__TENANTNAME=your-tenant
   CORTI__CLIENTID=your-client-id
   CORTI__CLIENTSECRET=your-client-secret
   CORTI__ENVIRONMENT=us
   ```
   `.env.local` overrides `.env`. These files are gitignored; do not commit secrets.

If any required value is missing, endpoints that need credentials will return a `400` with a message telling you what to set.

## Optional: use a local Corti SDK build

By default the project uses the **Corti** NuGet package. To use your local `corti-sdk-csh` build instead:

1. Copy `local.Corti.props.example` to `local.Corti.props` (the latter is gitignored).
2. In `local.Corti.props`, set `CortiProjectPath` to the path of `Corti.csproj` (e.g. `$(MSBuildThisFileDirectory)../../../corti-sdk-csh/src/Corti/Corti.csproj`).
3. Rebuild. The project will use the local SDK instead of the NuGet package.

This does **not** change runtime behaviour; it only switches the SDK reference at build time.
