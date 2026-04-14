/**
 * Shared JSON parsing and auth headers for dashboard `fetch` helpers.
 */

export function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function buildDashboardAuthHeaders(token: string): HeadersInit {
  const headers: Record<string, string> = {};
  if (token.trim() !== "") {
    headers.Authorization = `Bearer ${token}`;
  }
  const legacyKey = process.env.NEXT_PUBLIC_TRAFFIC_KEY?.trim();
  if (legacyKey !== undefined && legacyKey !== "") {
    headers["x-traffic-key"] = legacyKey;
  }
  return headers;
}

/**
 * Parses a successful `{ success: true, ... }` JSON body or throws.
 */
export async function parseApiSuccessResponse(
  res: Response
): Promise<Record<string, unknown>> {
  const body: unknown = await res.json();
  if (!isRecord(body)) {
    throw new Error("Invalid JSON response");
  }
  if (!res.ok || body.success === false) {
    const err = body.error;
    throw new Error(typeof err === "string" ? err : `HTTP ${res.status}`);
  }
  return body;
}
