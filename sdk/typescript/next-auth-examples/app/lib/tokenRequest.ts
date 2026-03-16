import type { TokenResponse } from "@/app/lib/types";

export type TokenRequestResult =
  | { ok: true; data: TokenResponse; environment: string; tenant: string }
  | { ok: false; error: string };

export async function requestToken(
  url: string,
  body: Record<string, unknown>,
  environment: string,
  tenant: string,
  defaultError: string,
): Promise<TokenRequestResult> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) {
      return {
        ok: false,
        error: data?.error ?? `Request failed (${res.status})`,
      };
    }
    return {
      ok: true,
      data: data as TokenResponse,
      environment,
      tenant,
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : defaultError,
    };
  }
}
