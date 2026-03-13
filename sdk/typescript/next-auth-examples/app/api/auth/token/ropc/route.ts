import { CortiAuth } from "@corti/sdk";
import { NextResponse } from "next/server";

type RopcRequestBody = {
  clientId?: unknown;
  environment?: unknown;
  tenant?: unknown;
  username?: unknown;
  password?: unknown;
};

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

export async function POST(request: Request) {
  let body: RopcRequestBody;
  try {
    body = (await request.json()) as RopcRequestBody;
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const clientId = isNonEmptyString(body.clientId) ? body.clientId.trim() : null;
  const environment = isNonEmptyString(body.environment) ? body.environment.trim() : null;
  const tenant = isNonEmptyString(body.tenant) ? body.tenant.trim() : null;
  const username = isNonEmptyString(body.username) ? body.username.trim() : null;
  const password = isNonEmptyString(body.password) ? body.password.trim() : null;

  if (!clientId || !environment || !tenant || !username || !password) {
    return NextResponse.json(
      {
        error:
          "Missing or empty required fields: clientId, environment, tenant, username, password",
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
    const tokenResponse = await cortiAuth.getRopcFlowToken({
      clientId,
      username,
      password,
    });

    return NextResponse.json(tokenResponse);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Token request failed";
    const status =
      typeof (e as { statusCode?: number })?.statusCode === "number"
        ? (e as { statusCode: number }).statusCode
        : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
