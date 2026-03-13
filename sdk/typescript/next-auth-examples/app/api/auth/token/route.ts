import { CortiAuth } from "@corti/sdk";
import { NextResponse } from "next/server";

type TokenRequestBody = {
  clientId?: unknown;
  clientSecret?: unknown;
  environment?: unknown;
  tenant?: unknown;
};

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

export async function POST(request: Request) {
  let body: TokenRequestBody;
  try {
    body = (await request.json()) as TokenRequestBody;
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const clientId = isNonEmptyString(body.clientId) ? body.clientId.trim() : null;
  const clientSecret = isNonEmptyString(body.clientSecret) ? body.clientSecret.trim() : null;
  const environment = isNonEmptyString(body.environment) ? body.environment.trim() : null;
  const tenant = isNonEmptyString(body.tenant) ? body.tenant.trim() : null;

  if (!clientId || !clientSecret || !environment || !tenant) {
    return NextResponse.json(
      {
        error: "Missing or empty required fields: clientId, clientSecret, environment, tenant",
      },
      { status: 400 }
    );
  }

  try {
    const cortiAuth = new CortiAuth({
      tenantName: tenant,
      environment,
    });

    // Here you should check that the user has access to request a token (e.g. session, role, tenant membership) before calling CortiAuth.
    const tokenResponse = await cortiAuth.getToken({
      clientId,
      clientSecret,
    });

    return NextResponse.json(tokenResponse);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Token request failed";
    const status = typeof (e as { statusCode?: number })?.statusCode === "number"
      ? (e as { statusCode: number }).statusCode
      : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
