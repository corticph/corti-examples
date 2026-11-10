/**
 * Integration tests for the Express app from createServer(): /api/config,
 * /api/auth/*, and the /api/corti proxy, driven over real HTTP.
 *
 * Nothing leaves the process: Keycloak calls (axios.post) are mocked, the
 * upstream proxy is replaced with a stub that runs our proxyReq hook and
 * echoes what it would have sent, and dotenv is mocked so a developer's local
 * .env cannot leak into the tests.
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { axiosPost, proxyOptions } = vi.hoisted(() => ({
  axiosPost: vi.fn(),
  proxyOptions: [] as ProxyOptions[],
}));

interface ProxyOptions {
  target: string;
  on: {
    proxyReq: (
      proxyReq: { setHeader: (k: string, v: string) => void; getHeader: (k: string) => unknown },
      req: IncomingMessage,
    ) => void;
  };
}

vi.mock("dotenv", () => ({ default: { config: vi.fn() } }));

vi.mock("axios", () => ({
  default: {
    post: axiosPost,
    isAxiosError: (e: unknown) => Boolean((e as { isAxiosError?: boolean })?.isAxiosError),
  },
}));

// Stand-in for the upstream Corti API: applies the real proxyReq hook to a
// header map seeded from the incoming request, then echoes the outcome.
vi.mock("http-proxy-middleware", () => ({
  createProxyMiddleware: (options: ProxyOptions) => {
    proxyOptions.push(options);
    return (req: IncomingMessage, res: ServerResponse) => {
      const headers = new Map<string, string>();
      for (const [key, value] of Object.entries(req.headers)) {
        headers.set(key, String(value));
      }
      options.on.proxyReq(
        {
          setHeader: (k, v) => headers.set(k.toLowerCase(), v),
          getHeader: (k) => headers.get(k.toLowerCase()),
        },
        req,
      );
      let body = "";
      req.on("data", (chunk) => {
        body += chunk;
      });
      req.on("end", () => {
        res.setHeader("Content-Type", "application/json");
        res.end(
          JSON.stringify({ target: options.target, headers: Object.fromEntries(headers), body }),
        );
      });
    };
  },
}));

const ENV_CREDS = {
  CORTI_CLIENT_ID: "env-client",
  CORTI_CLIENT_SECRET: "env-secret",
  CORTI_ENVIRONMENT: "dev-weu",
  CORTI_TENANT_NAME: "env-tenant",
};

const UI_CREDS = {
  client_id: "ui-client",
  client_secret: "ui-secret",
  cluster: "staging-eu",
  tenant: "ui-tenant",
};

interface TestResponse {
  status: number;
  headers: http.IncomingHttpHeaders;
  body: Record<string, unknown>;
  text: string;
}

let server: http.Server;
let port: number;

async function startServer() {
  vi.resetModules();
  const { createServer } = await import("./index");
  server = createServer().listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  port = (server.address() as AddressInfo).port;
}

function request(
  method: string,
  path: string,
  { headers = {}, json }: { headers?: Record<string, string>; json?: unknown } = {},
): Promise<TestResponse> {
  const payload = json === undefined ? undefined : JSON.stringify(json);
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: "127.0.0.1",
        port,
        method,
        path,
        headers: {
          ...(payload ? { "Content-Type": "application/json" } : {}),
          ...headers,
        },
      },
      (res) => {
        let raw = "";
        res.on("data", (chunk) => {
          raw += chunk;
        });
        res.on("end", () => {
          const isJson = String(res.headers["content-type"]).includes("application/json");
          resolve({
            status: res.statusCode ?? 0,
            headers: res.headers,
            body: isJson ? JSON.parse(raw) : {},
            text: raw,
          });
        });
      },
    );
    req.on("error", reject);
    req.end(payload);
  });
}

/** The `corti_sid=<id>` pair from a response's Set-Cookie header. */
function sessionCookie(res: TestResponse): string {
  const cookie = (res.headers["set-cookie"] ?? []).find((c) => c.startsWith("corti_sid="));
  if (!cookie) {
    throw new Error("response did not set corti_sid");
  }
  return cookie.split(";")[0];
}

function stubEnvCreds(creds: Partial<typeof ENV_CREDS> = ENV_CREDS) {
  for (const key of Object.keys(ENV_CREDS) as (keyof typeof ENV_CREDS)[]) {
    vi.stubEnv(key, creds[key]);
  }
}

function keycloakReturns(access_token: string, expires_in = 300) {
  axiosPost.mockResolvedValue({ data: { access_token, expires_in } });
}

beforeEach(() => {
  axiosPost.mockReset();
  proxyOptions.length = 0;
  vi.stubEnv("ALLOWED_HOSTS", undefined);
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await new Promise((resolve) => server.close(resolve));
});

describe("GET /api/config", () => {
  it("returns 503 NOT_CONFIGURED when no credentials exist", async () => {
    stubEnvCreds({});
    await startServer();

    const res = await request("GET", "/api/config");

    expect(res.status).toBe(503);
    expect(res.body).toEqual({ error: "NOT_CONFIGURED" });
  });

  it("returns the env cluster, tenant, and client id but never the secret", async () => {
    stubEnvCreds();
    await startServer();

    const res = await request("GET", "/api/config");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ cluster: "dev-weu", tenant: "env-tenant", clientId: "env-client" });
    expect(JSON.stringify(res.body)).not.toContain("env-secret");
    expect(sessionCookie(res)).toMatch(/^corti_sid=/);
  });

  it("is rejected for cross-site requests", async () => {
    stubEnvCreds();
    await startServer();

    const res = await request("GET", "/api/config", {
      headers: { Origin: "https://evil.example" },
    });

    expect(res.status).toBe(403);
  });
});

describe("POST /api/auth/token", () => {
  it("rejects missing fields without calling Keycloak", async () => {
    stubEnvCreds({});
    await startServer();

    const res = await request("POST", "/api/auth/token", { json: { client_id: "x" } });

    expect(res.status).toBe(400);
    expect(axiosPost).not.toHaveBeenCalled();
  });

  it("rejects an unsafe cluster or tenant without calling Keycloak", async () => {
    stubEnvCreds({});
    await startServer();

    const res = await request("POST", "/api/auth/token", {
      json: { ...UI_CREDS, cluster: "evil.example/x" },
    });

    expect(res.status).toBe(400);
    expect(axiosPost).not.toHaveBeenCalled();
  });

  it("validates against Keycloak and returns only the streaming token", async () => {
    stubEnvCreds({});
    keycloakReturns("ui-stream-token");
    await startServer();

    const res = await request("POST", "/api/auth/token", { json: UI_CREDS });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ access_token: "ui-stream-token", expires_in: 300 });
    const [url, form] = axiosPost.mock.calls[0];
    expect(url).toBe(
      "https://auth.staging-eu.corti.app/realms/ui-tenant/protocol/openid-connect/token",
    );
    expect((form as URLSearchParams).get("scope")).toBe("openid transcribe streams");
  });

  it("scopes the stored credentials to the submitting browser session", async () => {
    stubEnvCreds({});
    keycloakReturns("ui-stream-token");
    await startServer();

    const auth = await request("POST", "/api/auth/token", { json: UI_CREDS });
    const cookie = sessionCookie(auth);

    const sameBrowser = await request("GET", "/api/config", { headers: { Cookie: cookie } });
    expect(sameBrowser.body).toEqual({
      cluster: "staging-eu",
      tenant: "ui-tenant",
      clientId: "ui-client",
    });

    const otherBrowser = await request("GET", "/api/config");
    expect(otherBrowser.status).toBe(503);
  });

  it("forwards a Keycloak rejection and does not store the credentials", async () => {
    stubEnvCreds({});
    axiosPost.mockRejectedValue({
      isAxiosError: true,
      message: "Request failed with status code 401",
      response: {
        status: 401,
        data: { error: "unauthorized_client", error_description: "Invalid client secret" },
      },
    });
    await startServer();

    const res = await request("POST", "/api/auth/token", { json: UI_CREDS });

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "unauthorized_client", message: "Invalid client secret" });
    const config = await request("GET", "/api/config");
    expect(config.status).toBe(503);
  });
});

describe("POST /api/auth/stream-token", () => {
  it("rejects requests without a valid scope", async () => {
    stubEnvCreds();
    await startServer();

    const res = await request("POST", "/api/auth/stream-token", { json: { scopes: ["admin"] } });

    expect(res.status).toBe(400);
    expect(axiosPost).not.toHaveBeenCalled();
  });

  it("mints a token limited to the requested streaming scopes", async () => {
    stubEnvCreds();
    keycloakReturns("scoped-token", 120);
    await startServer();

    const res = await request("POST", "/api/auth/stream-token", {
      json: { scopes: ["transcribe", "admin"] },
    });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ access_token: "scoped-token", expires_in: 120 });
    const [url, form] = axiosPost.mock.calls[0];
    expect(url).toBe(
      "https://auth.dev-weu.corti.app/realms/env-tenant/protocol/openid-connect/token",
    );
    expect((form as URLSearchParams).get("scope")).toBe("openid transcribe");
  });
});

describe("/api/corti proxy", () => {
  it("returns 503 NOT_CONFIGURED when no credentials exist", async () => {
    stubEnvCreds({});
    await startServer();

    const res = await request("GET", "/api/corti/interactions");

    expect(res.status).toBe(503);
    expect(res.body.error).toBe("NOT_CONFIGURED");
  });

  it("injects the full-scope token, tenant, and analytics tag for the env cluster", async () => {
    stubEnvCreds();
    keycloakReturns("full-scope-token");
    await startServer();

    const res = await request("GET", "/api/corti/interactions");

    expect(res.status).toBe(200);
    expect(res.body.target).toBe("https://api.dev-weu.corti.app");
    const headers = res.body.headers as Record<string, string>;
    expect(headers.authorization).toBe("Bearer full-scope-token");
    expect(headers["tenant-name"]).toBe("env-tenant");
    expect(JSON.parse(headers["x-corti-analytics"])).toEqual({
      examples_repo: "sdk/typescript/sandbox",
    });
    expect((axiosPost.mock.calls[0][1] as URLSearchParams).get("scope")).toBe("openid");
  });

  it("keeps an analytics header the SDK already set", async () => {
    stubEnvCreds();
    keycloakReturns("full-scope-token");
    await startServer();

    const res = await request("GET", "/api/corti/interactions", {
      headers: { "x-corti-analytics": '{"sdk_type":"typescript"}' },
    });

    const headers = res.body.headers as Record<string, string>;
    expect(headers["x-corti-analytics"]).toBe('{"sdk_type":"typescript"}');
  });

  it("caches the full-scope token across requests", async () => {
    stubEnvCreds();
    keycloakReturns("full-scope-token");
    await startServer();

    await request("GET", "/api/corti/interactions");
    await request("GET", "/api/corti/interactions");

    expect(axiosPost).toHaveBeenCalledTimes(1);
  });

  it("streams the request body through untouched (mounted before the body parser)", async () => {
    stubEnvCreds();
    keycloakReturns("full-scope-token");
    await startServer();

    const res = await request("POST", "/api/corti/interactions", { json: { encounter: "x" } });

    expect(res.body.body).toBe('{"encounter":"x"}');
  });

  it("routes each session to its own cluster", async () => {
    stubEnvCreds();
    keycloakReturns("token");
    await startServer();

    const auth = await request("POST", "/api/auth/token", { json: UI_CREDS });
    const res = await request("GET", "/api/corti/interactions", {
      headers: { Cookie: sessionCookie(auth) },
    });
    const envRes = await request("GET", "/api/corti/interactions");

    expect(res.body.target).toBe("https://api.staging-eu.corti.app");
    expect((res.body.headers as Record<string, string>)["tenant-name"]).toBe("ui-tenant");
    expect(envRes.body.target).toBe("https://api.dev-weu.corti.app");
    expect(proxyOptions.map((o) => o.target)).toEqual([
      "https://api.staging-eu.corti.app",
      "https://api.dev-weu.corti.app",
    ]);
  });

  it("fails the request without proxying when the token cannot be minted", async () => {
    stubEnvCreds();
    axiosPost.mockRejectedValue(new Error("keycloak down"));
    await startServer();

    const res = await request("GET", "/api/corti/interactions");

    // Falls through to Express's default error handler (HTML, not JSON).
    expect(res.status).toBe(500);
    expect(res.text).not.toContain("Bearer");
  });
});
