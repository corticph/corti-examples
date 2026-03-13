import { CortiAuth } from "@corti/sdk";
import { NextResponse } from "next/server";
import { getErrorStatus, isNonEmptyString, parseJsonBody } from "@/app/lib/utils";

export async function POST(request: Request) {
  const body = await parseJsonBody(request);
  if (body === null || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const clientId = isNonEmptyString(body.clientId) ? body.clientId.trim() : null;
  const clientSecret = isNonEmptyString(body.clientSecret) ? body.clientSecret.trim() : null;
  const environment = isNonEmptyString(body.environment) ? body.environment.trim() : null;
  const tenant = isNonEmptyString(body.tenant) ? body.tenant.trim() : null;
  const code = isNonEmptyString(body.code) ? body.code.trim() : null;
  const redirectUri = isNonEmptyString(body.redirectUri) ? body.redirectUri.trim() : null;

  if (!clientId || !clientSecret || !environment || !tenant || !code || !redirectUri) {
    return NextResponse.json(
      {
        error:
          "Missing or empty required fields: clientId, clientSecret, environment, tenant, code, redirectUri",
      },
      { status: 400 },
    );
  }

  try {
    const cortiAuth = new CortiAuth({
      tenantName: tenant,
      environment,
    });
    const tokenResponse = await cortiAuth.getCodeFlowToken({
      clientId,
      clientSecret,
      code,
      redirectUri,
    });
    return NextResponse.json(tokenResponse);
  } catch (e) {
    const { message, status } = getErrorStatus(e, "Token exchange failed");
    return NextResponse.json({ error: message }, { status });
  }
}
