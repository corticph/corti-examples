import { NextResponse } from "next/server";
import { getCortiRopcToken } from "@/lib/corti-server-auth";

export const runtime = "nodejs";

export async function GET() {
  try {
    const tokenResponse = await getCortiRopcToken();

    return NextResponse.json({
      access_token: tokenResponse.accessToken,
      refresh_token: tokenResponse.refreshToken,
      id_token: "",
      token_type: tokenResponse.tokenType || "Bearer",
      expires_in: tokenResponse.expiresIn,
      mode: "stateful",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown authentication error";
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
