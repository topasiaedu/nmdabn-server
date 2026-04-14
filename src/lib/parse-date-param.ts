/**
 * Parses an optional ISO date query parameter.
 * - Absent or blank → `{ ok: true, value: null }`
 * - Non-blank but unparseable → `{ ok: false, error: string }`
 * - Valid ISO string → `{ ok: true, value: trimmed string }`
 */
export function parseOptionalIsoDateParam(
  raw: string | null
): { ok: true; value: string | null } | { ok: false; error: string } {
  if (raw === null) {
    return { ok: true, value: null };
  }
  const trimmed = raw.trim();
  if (trimmed === "") {
    return { ok: true, value: null };
  }
  if (Number.isNaN(Date.parse(trimmed))) {
    return {
      ok: false,
      error: "date_from or date_to must be a valid ISO date string",
    };
  }
  return { ok: true, value: trimmed };
}
