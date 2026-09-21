import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  const environment = process.env.CORTI_ENVIRONMENT!.trim();

  return NextResponse.json({
    baseUrl: `https://assistant.${environment}.corti.app`,
  });
}
