import { CortiAuth, CortiClient, CortiEnvironment } from "@corti/sdk";
import type { Application, Request, Response } from "express";
import { asyncHandler } from "../lib/asyncHandler.js";
import { getAuthCodeConfig, getCortiConfig, getPkceConfig, getRopcConfig } from "../lib/corti.js";

type VariantResult = {
  name: string;
  status: "ok" | "error" | "skipped";
  message?: string;
  expectedError?: true;
};

export function registerClientVariants(app: Application): void {
  app.get("/client-variants", asyncHandler(clientVariants));
}

async function clientVariants(req: Request, res: Response): Promise<void> {
  const cc = getCortiConfig();
  const ropc = getRopcConfig();
  const authCodeConfig = getAuthCodeConfig();
  const pkceConfig = getPkceConfig();
  const authCodeQueryCode =
    typeof req.query.authCode === "string" ? req.query.authCode.trim() : undefined;
  const pkceQueryCode =
    typeof req.query.pkceCode === "string" ? req.query.pkceCode.trim() : undefined;
  const pkceQueryVerifier =
    typeof req.query.pkceVerifier === "string" ? req.query.pkceVerifier.trim() : undefined;
  const results: VariantResult[] = [];

  async function run(
    name: string,
    factory: () => Promise<CortiClient> | CortiClient,
    opts: { expectedError?: true } = {},
  ): Promise<void> {
    try {
      const client = await factory();
      await client.facts.factGroupsList();
      results.push({ name, status: "ok", ...opts });
    } catch (e) {
      results.push({
        name,
        status: "error",
        message: e instanceof Error ? e.message : String(e),
        ...opts,
      });
    }
  }

  // 1. CC — explicit tenant + env (string)
  if (cc) {
    await run(
      "cc-explicit",
      () =>
        new CortiClient({
          tenantName: cc.tenantName,
          environment: cc.environment,
          auth: { clientId: cc.clientId, clientSecret: cc.clientSecret },
        }),
    );
  } else {
    results.push({ name: "cc-explicit", status: "skipped" });
  }

  // 2. ROPC — explicit tenant + env (string)
  if (ropc) {
    await run(
      "ropc-explicit",
      () =>
        new CortiClient({
          tenantName: ropc.tenantName,
          environment: ropc.environment,
          auth: { clientId: ropc.clientId, username: ropc.username, password: ropc.password },
        }),
    );
  } else {
    results.push({ name: "ropc-explicit", status: "skipped" });
  }

  // 3. CC — environment as library constant (CortiEnvironment.Us)
  if (cc) {
    await run(
      "cc-env-library",
      () =>
        new CortiClient({
          tenantName: cc.tenantName,
          environment: CortiEnvironment.Us,
          auth: { clientId: cc.clientId, clientSecret: cc.clientSecret },
        }),
    );
  } else {
    results.push({ name: "cc-env-library", status: "skipped" });
  }

  // 4. CC — custom environment URLs object (CortiEnvironmentUrls)
  if (cc) {
    await run(
      "cc-env-custom-urls",
      () =>
        new CortiClient({
          tenantName: cc.tenantName,
          environment: {
            base: `https://api.${cc.environment}.corti.app/v2`,
            wss: `wss://api.${cc.environment}.corti.app/audio-bridge/v2`,
            login: `https://auth.${cc.environment}.corti.app/realms`,
            agents: `https://api.${cc.environment}.corti.app`,
          },
          auth: { clientId: cc.clientId, clientSecret: cc.clientSecret },
        }),
    );
  } else {
    results.push({ name: "cc-env-custom-urls", status: "skipped" });
  }

  // 5. Custom environment URLs — no auth, no tenantName (proxy/passthrough; both are optional in the CortiEnvironmentUrls arm).
  //    A 401 response from the API is expected here: the client is constructed successfully (the SDK does not require
  //    credentials at construction time), but every request will be rejected by the server because no Authorization
  //    header is sent.
  if (cc) {
    await run(
      "env-custom-urls-no-auth",
      () =>
        new CortiClient({
          environment: {
            base: `https://api.${cc.environment}.corti.app/v2`,
            wss: `wss://api.${cc.environment}.corti.app/audio-bridge/v2`,
            login: `https://auth.${cc.environment}.corti.app/realms`,
            agents: `https://api.${cc.environment}.corti.app`,
          },
          // no auth — demonstrates that auth is optional in the CortiEnvironmentUrls arm
        }),
      { expectedError: true },
    );
  } else {
    results.push({ name: "env-custom-urls-no-auth", status: "skipped" });
  }

  if (cc) {
    const cortiAuth = new CortiAuth({ tenantName: cc.tenantName, environment: cc.environment });
    const token = await cortiAuth.getToken({
      clientId: cc.clientId,
      clientSecret: cc.clientSecret,
    });
    const accessToken = token.accessToken ?? "";

    // 6. Bearer — explicit tenant + env
    await run(
      "bearer-explicit",
      () =>
        new CortiClient({
          tenantName: cc.tenantName,
          environment: cc.environment,
          auth: { accessToken },
        }),
    );

    // 7. Bearer — auto-derive tenant + env from JWT
    await run(
      "bearer-auto-derive",
      () =>
        new CortiClient({
          auth: { accessToken },
        }),
    );

    // 8. Bearer — explicit + custom refreshAccessToken (accessToken is primary; fn called on expiry)
    await run(
      "bearer-with-refresh-fn",
      () =>
        new CortiClient({
          tenantName: cc.tenantName,
          environment: cc.environment,
          auth: {
            accessToken,
            refreshAccessToken: () =>
              cortiAuth.getToken({ clientId: cc.clientId, clientSecret: cc.clientSecret }),
          },
        }),
    );

    // 9. Bearer — custom refreshAccessToken as primary, seeded with initial accessToken (avoids an immediate refresh call)
    await run(
      "bearer-custom-refresh-seeded",
      () =>
        new CortiClient({
          tenantName: cc.tenantName,
          environment: cc.environment,
          auth: {
            refreshAccessToken: () =>
              cortiAuth.getToken({ clientId: cc.clientId, clientSecret: cc.clientSecret }),
            accessToken,
            ...(token.expiresIn != null ? { expiresIn: token.expiresIn } : {}),
          },
        }),
    );

    // 10. baseUrl string — alternative to environment string or CortiEnvironmentUrls object (auth is optional in the baseUrl arm).
    //     Note: `baseUrl` points to the main API only. The OAuth token endpoint lives on a separate host
    //     (auth.{environment}.corti.app), so the SDK cannot derive it from `baseUrl` alone and token
    //     requests will fail. A 401 / auth error is expected. Use `environment` (string or object) when
    //     you also need authentication, so the SDK knows where to reach the auth server.
    await run(
      "baseUrl-cc",
      () =>
        new CortiClient({
          tenantName: cc.tenantName,
          baseUrl: `https://api.${cc.environment}.corti.app/v2`,
          auth: { clientId: cc.clientId, clientSecret: cc.clientSecret },
        }),
      { expectedError: true },
    );
  } else {
    results.push(
      { name: "bearer-explicit", status: "skipped" },
      { name: "bearer-auto-derive", status: "skipped" },
      { name: "bearer-with-refresh-fn", status: "skipped" },
      { name: "bearer-custom-refresh-seeded", status: "skipped" },
      { name: "baseUrl-cc", status: "skipped" },
    );
  }

  if (ropc) {
    const cortiAuth = new CortiAuth({ tenantName: ropc.tenantName, environment: ropc.environment });
    const getRopcToken = (): ReturnType<CortiAuth["getRopcFlowToken"]> =>
      cortiAuth.getRopcFlowToken({
        clientId: ropc.clientId,
        username: ropc.username,
        password: ropc.password,
      });

    // 11. refreshAccessToken only — explicit tenant + env
    await run(
      "refresh-fn-explicit",
      () =>
        new CortiClient({
          tenantName: ropc.tenantName,
          environment: ropc.environment,
          auth: { refreshAccessToken: getRopcToken },
        }),
    );

    // 12. refreshAccessToken only — auto-derive tenant + env from JWT
    await run(
      "refresh-fn-auto-derive",
      () =>
        new CortiClient({
          auth: { refreshAccessToken: getRopcToken },
        }),
    );

    // 13. Bearer with built-in refresh (accessToken + clientId + refreshToken — SDK calls refresh_token grant on expiry)
    //     ROPC is used here because client_credentials flows don't return a refresh token.
    const ropcToken = await cortiAuth.getRopcFlowToken({
      clientId: ropc.clientId,
      username: ropc.username,
      password: ropc.password,
    });
    const refreshToken = ropcToken.refreshToken;
    if (refreshToken) {
      await run(
        "bearer-with-builtin-refresh",
        () =>
          new CortiClient({
            tenantName: ropc.tenantName,
            environment: ropc.environment,
            auth: {
              accessToken: ropcToken.accessToken ?? "",
              clientId: ropc.clientId,
              refreshToken,
              ...(ropcToken.expiresIn != null ? { expiresIn: ropcToken.expiresIn } : {}),
              ...(ropcToken.refreshExpiresIn != null
                ? { refreshExpiresIn: ropcToken.refreshExpiresIn }
                : {}),
            },
          }),
      );
    } else {
      results.push({
        name: "bearer-with-builtin-refresh",
        status: "skipped",
        message: "ROPC response did not include a refresh token",
      });
    }
  } else {
    results.push(
      { name: "refresh-fn-explicit", status: "skipped" },
      { name: "refresh-fn-auto-derive", status: "skipped" },
      { name: "bearer-with-builtin-refresh", status: "skipped" },
    );
  }

  // auth-code-client: pass ?authCode=<code> from a real redirect to test this variant.
  // The code is a one-time value from the OAuth redirect and cannot be stored in env vars.
  if (authCodeConfig && authCodeQueryCode) {
    await run(
      "auth-code-client",
      () =>
        new CortiClient({
          tenantName: authCodeConfig.tenantName,
          environment: authCodeConfig.environment,
          auth: {
            clientId: authCodeConfig.clientId,
            clientSecret: authCodeConfig.clientSecret,
            code: authCodeQueryCode,
            redirectUri: authCodeConfig.redirectUri,
          },
        }),
    );
  } else {
    results.push({
      name: "auth-code-client",
      status: "skipped",
      message: authCodeConfig
        ? "Pass ?authCode=<code> from a fresh redirect to test this variant"
        : "Auth code env vars not configured",
    });
  }

  // pkce-client: pass ?pkceCode=<code>&pkceVerifier=<verifier> from a real redirect to test this variant.
  if (pkceConfig && pkceQueryCode && pkceQueryVerifier) {
    await run(
      "pkce-client",
      () =>
        new CortiClient({
          tenantName: pkceConfig.tenantName,
          environment: pkceConfig.environment,
          auth: {
            clientId: pkceConfig.clientId,
            code: pkceQueryCode,
            redirectUri: pkceConfig.redirectUri,
            codeVerifier: pkceQueryVerifier,
          },
        }),
    );
  } else {
    results.push({
      name: "pkce-client",
      status: "skipped",
      message: pkceConfig
        ? "Pass ?pkceCode=<code>&pkceVerifier=<verifier> from a fresh redirect to test this variant"
        : "PKCE env vars not configured",
    });
  }

  res.json({ variants: results });
}
