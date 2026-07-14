// Talks to the local dev server for OAuth2 client_credentials token minting.
// The dev server proxies the request to https://auth.{region}.corti.app so we don't trip
// CORS from the browser.

export type EnvImport = {
  hasCredentials: boolean;
  region: string;
  tenant: string;
  clientId: string;
  clientSecret: string;
};

export type TokenMintInput = {
  region: string;
  tenant: string;
  clientId: string;
  clientSecret: string;
};

export type TokenMintResult = {
  accessToken: string;
  expiresIn: number;
  tokenType: string;
};

export async function importEnvProfile(): Promise<EnvImport> {
  const r = await fetch("/api/auth/env");
  if (!r.ok) throw new Error(`env import ${r.status}`);
  return r.json();
}

export async function mintToken(input: TokenMintInput): Promise<TokenMintResult> {
  const r = await fetch("/api/auth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const text = await r.text();
  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  if (!r.ok) {
    const msg =
      typeof data === "object" && data?.error
        ? typeof data.error === "string"
          ? data.error
          : JSON.stringify(data.error)
        : `HTTP ${r.status}`;
    throw new Error(msg);
  }
  return data;
}
