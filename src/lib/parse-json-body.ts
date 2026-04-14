import type { NextRequest } from "next/server";

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export type JsonObjectResult =
  | { ok: true; body: Record<string, unknown> }
  | { ok: false; status: number; error: string };

/**
 * Parses the request body as a single JSON object (not array or primitive).
 */
export async function parseJsonObjectBody(
  request: NextRequest
): Promise<JsonObjectResult> {
  try {
    const raw: unknown = await request.json();
    if (!isRecord(raw)) {
      return {
        ok: false,
        status: 400,
        error: "Request body must be a JSON object",
      };
    }
    return { ok: true, body: raw };
  } catch {
    return {
      ok: false,
      status: 400,
      error: "Invalid JSON body",
    };
  }
}
