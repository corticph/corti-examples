import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type CortiCreds = {
  clientId: string;
  clientSecret: string;
  cluster: string;
  tenant: string;
};

type Exports = {
  getCreds: (sessionId?: string) => CortiCreds;
  hasCreds: (sessionId?: string) => boolean;
  isEnvConfigured: (sessionId?: string) => boolean;
  setRuntimeCreds: (sessionId: string, creds: CortiCreds) => void;
  getFullScopeToken: (sessionId?: string) => Promise<string>;
  getScopedToken: (
    scopes: ("transcribe" | "streams")[],
    sessionId?: string,
  ) => Promise<{ access_token: string; expires_in: number }>;
};

const CREDS = {
  CORTI_CLIENT_ID: "test-client-id",
  CORTI_CLIENT_SECRET: "test-client-secret",
  CORTI_ENVIRONMENT: "dev-weu",
  CORTI_TENANT_NAME: "base",
} as const;

async function importFresh(): Promise<Exports> {
  vi.resetModules();
  return (await import("./cortiToken")) as Exports;
}

function setEnv(overrides: Partial<Record<string, string | undefined>> = {}) {
  process.env = {
    ...process.env,
    CORTI_CLIENT_ID: CREDS.CORTI_CLIENT_ID,
    CORTI_CLIENT_SECRET: CREDS.CORTI_CLIENT_SECRET,
    CORTI_ENVIRONMENT: CREDS.CORTI_ENVIRONMENT,
    CORTI_TENANT_NAME: CREDS.CORTI_TENANT_NAME,
    ...overrides,
  };
}

const SAVED_ENV = { ...process.env };

describe("readEnvCreds (via getCreds)", () => {
  afterEach(() => {
    process.env = { ...SAVED_ENV };
  });

  it("reads CORTI_ENVIRONMENT and CORTI_TENANT_NAME", async () => {
    setEnv();
    const { getCreds } = await importFresh();
    const creds = getCreds();
    expect(creds).toEqual({
      clientId: CREDS.CORTI_CLIENT_ID,
      clientSecret: CREDS.CORTI_CLIENT_SECRET,
      cluster: CREDS.CORTI_ENVIRONMENT,
      tenant: CREDS.CORTI_TENANT_NAME,
    });
  });

  it("defaults cluster to dev-weu when CORTI_ENVIRONMENT is unset", async () => {
    setEnv({ CORTI_ENVIRONMENT: undefined });
    const { getCreds } = await importFresh();
    const creds = getCreds();
    expect(creds.cluster).toBe("dev-weu");
  });

  it("throws when CORTI_TENANT_NAME is missing", async () => {
    setEnv({ CORTI_TENANT_NAME: undefined });
    const { getCreds } = await importFresh();
    expect(() => getCreds()).toThrow(/CORTI_TENANT_NAME/);
  });

  it("throws when CORTI_CLIENT_ID is missing", async () => {
    setEnv({ CORTI_CLIENT_ID: undefined });
    const { getCreds } = await importFresh();
    expect(() => getCreds()).toThrow(/CORTI_CLIENT_ID/);
  });

  it("throws when CORTI_CLIENT_SECRET is missing", async () => {
    setEnv({ CORTI_CLIENT_SECRET: undefined });
    const { getCreds } = await importFresh();
    expect(() => getCreds()).toThrow(/CORTI_CLIENT_ID/);
  });

  it("throws on invalid CORTI_ENVIRONMENT (uppercase)", async () => {
    setEnv({ CORTI_ENVIRONMENT: "Dev-WEU" });
    const { getCreds } = await importFresh();
    expect(() => getCreds()).toThrow(/CORTI_ENVIRONMENT/);
  });

  it("throws on invalid CORTI_TENANT_NAME (special chars)", async () => {
    setEnv({ CORTI_TENANT_NAME: "base/evil" });
    const { getCreds } = await importFresh();
    expect(() => getCreds()).toThrow(/CORTI_TENANT_NAME/);
  });

  it("does not read old CORTI_CLUSTER / CORTI_TENANT names", async () => {
    setEnv({
      CORTI_ENVIRONMENT: undefined,
      CORTI_TENANT_NAME: undefined,
      CORTI_CLUSTER: "staging-eu",
      CORTI_TENANT: "should-be-ignored",
    });
    const { getCreds } = await importFresh();
    expect(() => getCreds()).toThrow(/CORTI_TENANT_NAME/);
  });

  it("caches the result — subsequent calls return the same object", async () => {
    setEnv();
    const { getCreds } = await importFresh();
    const first = getCreds();
    const second = getCreds();
    expect(second).toBe(first);
  });

  it("caches the error — subsequent calls throw the same error", async () => {
    setEnv({ CORTI_TENANT_NAME: undefined });
    const { getCreds } = await importFresh();
    let firstErr: Error | undefined;
    try {
      getCreds();
    } catch (e) {
      firstErr = e as Error;
    }
    let secondErr: Error | undefined;
    try {
      getCreds();
    } catch (e) {
      secondErr = e as Error;
    }
    expect(secondErr).toBe(firstErr);
  });
});

describe("hasCreds", () => {
  afterEach(() => {
    process.env = { ...SAVED_ENV };
  });

  it("returns true when env creds are present", async () => {
    setEnv();
    const { hasCreds } = await importFresh();
    expect(hasCreds()).toBe(true);
  });

  it("returns false when env creds are incomplete", async () => {
    setEnv({ CORTI_TENANT_NAME: undefined });
    const { hasCreds } = await importFresh();
    expect(hasCreds()).toBe(false);
  });

  it("returns true when session creds are set even without env creds", async () => {
    setEnv({ CORTI_TENANT_NAME: undefined });
    const mod = await importFresh();
    mod.setRuntimeCreds("sess-1", {
      clientId: "ui-id",
      clientSecret: "ui-secret",
      cluster: "dev-weu",
      tenant: "base",
    });
    expect(mod.hasCreds("sess-1")).toBe(true);
  });
});

describe("isEnvConfigured", () => {
  afterEach(() => {
    process.env = { ...SAVED_ENV };
  });

  it("returns true when only env creds are present", async () => {
    setEnv();
    const { isEnvConfigured } = await importFresh();
    expect(isEnvConfigured()).toBe(true);
  });

  it("returns false when session creds override env creds", async () => {
    setEnv();
    const mod = await importFresh();
    mod.setRuntimeCreds("sess-1", {
      clientId: "ui-id",
      clientSecret: "ui-secret",
      cluster: "dev-weu",
      tenant: "base",
    });
    expect(mod.isEnvConfigured("sess-1")).toBe(false);
  });

  it("returns false when no creds at all", async () => {
    setEnv({ CORTI_TENANT_NAME: undefined });
    const { isEnvConfigured } = await importFresh();
    expect(isEnvConfigured()).toBe(false);
  });
});

describe("getCreds priority", () => {
  afterEach(() => {
    process.env = { ...SAVED_ENV };
  });

  it("session creds take priority over env creds", async () => {
    setEnv();
    const mod = await importFresh();
    mod.setRuntimeCreds("sess-1", {
      clientId: "ui-id",
      clientSecret: "ui-secret",
      cluster: "staging-eu",
      tenant: "custom-tenant",
    });
    const creds = mod.getCreds("sess-1");
    expect(creds.clientId).toBe("ui-id");
    expect(creds.tenant).toBe("custom-tenant");
  });

  it("falls back to env creds when session has no creds", async () => {
    setEnv();
    const mod = await importFresh();
    const creds = mod.getCreds("sess-unknown");
    expect(creds.clientId).toBe(CREDS.CORTI_CLIENT_ID);
  });
});

describe("setRuntimeCreds", () => {
  afterEach(() => {
    process.env = { ...SAVED_ENV };
  });

  it("stores creds per session id", async () => {
    setEnv();
    const mod = await importFresh();
    mod.setRuntimeCreds("sess-a", {
      clientId: "a-id",
      clientSecret: "a-secret",
      cluster: "dev-weu",
      tenant: "tenant-a",
    });
    mod.setRuntimeCreds("sess-b", {
      clientId: "b-id",
      clientSecret: "b-secret",
      cluster: "dev-weu",
      tenant: "tenant-b",
    });
    expect(mod.getCreds("sess-a").tenant).toBe("tenant-a");
    expect(mod.getCreds("sess-b").tenant).toBe("tenant-b");
  });
});

describe("getFullScopeToken", () => {
  const mockPost = vi.fn();

  beforeEach(() => {
    vi.resetModules();
    vi.doMock("axios", () => ({
      default: { post: mockPost },
      isAxiosError: (e: unknown) => e && typeof e === "object" && "isAxiosError" in e,
    }));
  });

  afterEach(() => {
    vi.doUnmock("axios");
    process.env = { ...SAVED_ENV };
    mockPost.mockReset();
  });

  it("mints a token using env creds and caches it", async () => {
    setEnv();
    mockPost.mockResolvedValueOnce({
      data: { access_token: "token-1", expires_in: 300 },
    });

    const mod = await importFresh();
    const token = await mod.getFullScopeToken();
    expect(token).toBe("token-1");

    const [url, body, config] = mockPost.mock.calls[0];
    expect(url).toBe("https://auth.dev-weu.corti.app/realms/base/protocol/openid-connect/token");
    expect(body.get("client_id")).toBe(CREDS.CORTI_CLIENT_ID);
    expect(body.get("client_secret")).toBe(CREDS.CORTI_CLIENT_SECRET);
    expect(body.get("scope")).toBe("openid");
    expect(config.headers["Content-Type"]).toBe("application/x-www-form-urlencoded");

    // Second call should hit the cache — no new axios post
    const token2 = await mod.getFullScopeToken();
    expect(token2).toBe("token-1");
    expect(mockPost).toHaveBeenCalledTimes(1);
  });

  it("uses session creds when present", async () => {
    setEnv();
    mockPost.mockResolvedValueOnce({
      data: { access_token: "sess-token", expires_in: 300 },
    });

    const mod = await importFresh();
    mod.setRuntimeCreds("sess-1", {
      clientId: "ui-id",
      clientSecret: "ui-secret",
      cluster: "staging-eu",
      tenant: "custom-tenant",
    });
    const token = await mod.getFullScopeToken("sess-1");
    expect(token).toBe("sess-token");

    const [url, body] = mockPost.mock.calls[0];
    expect(url).toBe(
      "https://auth.staging-eu.corti.app/realms/custom-tenant/protocol/openid-connect/token",
    );
    expect(body.get("client_id")).toBe("ui-id");
  });
});

describe("getScopedToken", () => {
  const mockPost = vi.fn();

  beforeEach(() => {
    vi.resetModules();
    vi.doMock("axios", () => ({
      default: { post: mockPost },
      isAxiosError: (e: unknown) => e && typeof e === "object" && "isAxiosError" in e,
    }));
  });

  afterEach(() => {
    vi.doUnmock("axios");
    process.env = { ...SAVED_ENV };
    mockPost.mockReset();
  });

  it("builds the correct scope string for transcribe", async () => {
    setEnv();
    mockPost.mockResolvedValueOnce({
      data: { access_token: "scoped-1", expires_in: 300 },
    });

    const mod = await importFresh();
    const result = await mod.getScopedToken(["transcribe"]);
    expect(result.access_token).toBe("scoped-1");

    const [, body] = mockPost.mock.calls[0];
    expect(body.get("scope")).toBe("openid transcribe");
  });

  it("builds the correct scope string for multiple scopes", async () => {
    setEnv();
    mockPost.mockResolvedValueOnce({
      data: { access_token: "scoped-2", expires_in: 300 },
    });

    const mod = await importFresh();
    await mod.getScopedToken(["transcribe", "streams"]);

    const [, body] = mockPost.mock.calls[0];
    expect(body.get("scope")).toBe("openid transcribe streams");
  });
});
