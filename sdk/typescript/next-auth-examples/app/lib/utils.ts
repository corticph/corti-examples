export function maskToken(token: string): string {
  if (token.length <= 12) {
    return "••••••••";
  }
  return `${token.slice(0, 8)}…${token.slice(-4)}`;
}

export function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

export async function parseJsonBody(request: Request): Promise<unknown | null> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

export function getErrorStatus(
  e: unknown,
  defaultMessage: string,
): { message: string; status: number } {
  const message = e instanceof Error ? e.message : defaultMessage;
  const status =
    typeof (e as { statusCode?: number })?.statusCode === "number"
      ? (e as { statusCode: number }).statusCode
      : 500;
  return { message, status };
}
