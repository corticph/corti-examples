import { NextResponse } from "next/server";
import { CortiAuth } from "@corti/sdk";

export const runtime = "nodejs";

export async function GET() {
  try {
    const environment = process.env.CORTI_ENVIRONMENT!.trim();
    const tenantName = process.env.CORTI_TENANT_NAME!.trim();
    const clientId = process.env.CORTI_CLIENT_ID!.trim();
    const username = process.env.CORTI_USER_EMAIL!.trim();
    const password = process.env.CORTI_USER_PASSWORD!.trim();

    const auth = new CortiAuth({
      environment,
      tenantName,
    });
    const tokenResponse = await auth.getRopcFlowToken({
      clientId,
      username,
      password,
    });

    return NextResponse.json({
      access_token: tokenResponse.accessToken,
      refresh_token: tokenResponse.refreshToken,
      id_token: "",
      token_type: tokenResponse.tokenType || "Bearer",
      expires_in: tokenResponse.expiresIn,
      mode: "stateful",
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown authentication error";
    console.error("Corti authentication error", error);

    return NextResponse.json(
      {
        error: "Failed to authenticate",
        message,
      },
      { status: 500 },
    );
  }
}
