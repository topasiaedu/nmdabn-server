/**
 * Traffic dashboard: agency line → GHL tag names (OR semantics per line).
 * JSON object: keys are line codes (e.g. OM, NM); values are string arrays of tag_name.
 */

const DEFAULT_AGENCY_LINE_TAGS: Readonly<Record<string, readonly string[]>> = {
  OM: ["lead_om"],
  NM: ["lead_nm"],
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Parses TRAFFIC_AGENCY_LINE_TAGS_JSON or returns built-in defaults for local dev.
 */
export function loadTrafficAgencyLineTags(
  rawJson: string | undefined
): Record<string, string[]> {
  if (rawJson === undefined || rawJson.trim() === "") {
    return Object.fromEntries(
      Object.entries(DEFAULT_AGENCY_LINE_TAGS).map(([k, v]) => [k, [...v]])
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson) as unknown;
  } catch {
    throw new Error(
      "TRAFFIC_AGENCY_LINE_TAGS_JSON must be valid JSON object mapping line keys to tag name arrays"
    );
  }

  if (!isRecord(parsed)) {
    throw new Error("TRAFFIC_AGENCY_LINE_TAGS_JSON must be a JSON object");
  }

  const out: Record<string, string[]> = {};
  for (const [lineKey, value] of Object.entries(parsed)) {
    if (lineKey.trim() === "") {
      continue;
    }
    if (!Array.isArray(value)) {
      throw new Error(
        `TRAFFIC_AGENCY_LINE_TAGS_JSON: value for "${lineKey}" must be a JSON array of strings`
      );
    }
    const tags: string[] = [];
    for (const item of value) {
      if (typeof item !== "string" || item.trim() === "") {
        throw new Error(
          `TRAFFIC_AGENCY_LINE_TAGS_JSON: "${lineKey}" must contain only non-empty strings`
        );
      }
      tags.push(item.trim());
    }
    if (tags.length === 0) {
      throw new Error(
        `TRAFFIC_AGENCY_LINE_TAGS_JSON: "${lineKey}" must list at least one tag`
      );
    }
    out[lineKey.trim()] = tags;
  }

  if (Object.keys(out).length === 0) {
    throw new Error("TRAFFIC_AGENCY_LINE_TAGS_JSON must define at least one line");
  }

  return out;
}

export function getTagsForLine(
  lineKey: string,
  mapping: Record<string, string[]>
): string[] | undefined {
  const entry = mapping[lineKey];
  if (entry !== undefined && entry.length > 0) {
    return entry;
  }
  return undefined;
}

export function listConfiguredLineKeys(mapping: Record<string, string[]>): string[] {
  return Object.keys(mapping).sort();
}

/**
 * Parses optional per-project JSONB (same shape as TRAFFIC_AGENCY_LINE_TAGS_JSON).
 * Returns null when absent or invalid (caller falls back to env defaults).
 */
export function parseProjectAgencyLineTags(value: unknown): Record<string, string[]> | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (!isRecord(value)) {
    return null;
  }
  try {
    const out: Record<string, string[]> = {};
    for (const [lineKey, raw] of Object.entries(value)) {
      if (lineKey.trim() === "") {
        continue;
      }
      if (!Array.isArray(raw)) {
        return null;
      }
      const tags: string[] = [];
      for (const item of raw) {
        if (typeof item !== "string" || item.trim() === "") {
          return null;
        }
        tags.push(item.trim());
      }
      if (tags.length === 0) {
        return null;
      }
      out[lineKey.trim()] = tags;
    }
    if (Object.keys(out).length === 0) {
      return null;
    }
    return out;
  } catch {
    return null;
  }
}
