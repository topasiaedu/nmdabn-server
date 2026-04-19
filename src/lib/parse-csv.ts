/**
 * Minimal RFC 4180-style CSV parser (quoted fields, escaped quotes).
 */

export function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let i = 0;
  let inQuotes = false;
  const s = text.replace(/^\uFEFF/, "");

  while (i < s.length) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += c;
      i += 1;
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (c === ",") {
      row.push(field);
      field = "";
      i += 1;
      continue;
    }
    if (c === "\r") {
      i += 1;
      continue;
    }
    if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      i += 1;
      continue;
    }
    field += c;
    i += 1;
  }
  row.push(field);
  if (row.length > 1 || (row.length === 1 && row[0] !== "")) {
    rows.push(row);
  }
  return rows;
}

function normalizeHeaderCell(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

export type ParsedLeadSheetRow = {
  dateTimeRaw: string;
  fullName: string;
  email: string;
  phone: string;
  utmContent: string;
  utmMedium: string;
  utmSource: string;
  utmCampaign: string;
};

/**
 * Maps header row to canonical keys (supports CAE webinar tracking sheet headers).
 */
function headerToKey(normalized: string): keyof ParsedLeadSheetRow | null {
  if (
    normalized === "date time" ||
    normalized === "date t ime" ||
    normalized === "datetime"
  ) {
    return "dateTimeRaw";
  }
  if (normalized === "full name" || normalized === "name") {
    return "fullName";
  }
  if (normalized === "email") {
    return "email";
  }
  if (normalized === "phone number" || normalized === "phone") {
    return "phone";
  }
  if (normalized === "utm content") {
    return "utmContent";
  }
  if (normalized === "utm medium") {
    return "utmMedium";
  }
  if (normalized === "utm source") {
    return "utmSource";
  }
  if (normalized === "utm campaign") {
    return "utmCampaign";
  }
  return null;
}

/**
 * Parses CAE-style webinar lead CSV into row objects; skips empty lines.
 */
export function parseLeadTrackingCsv(text: string): {
  rows: ParsedLeadSheetRow[];
  error: string | null;
} {
  const grid = parseCsvRows(text);
  if (grid.length < 2) {
    return { rows: [], error: "CSV must include a header row and at least one data row" };
  }

  const headerCells = grid[0].map((c) => normalizeHeaderCell(c));
  const colMap: Partial<Record<keyof ParsedLeadSheetRow, number>> = {};
  for (let c = 0; c < headerCells.length; c += 1) {
    const key = headerToKey(headerCells[c]);
    if (key !== null && colMap[key] === undefined) {
      colMap[key] = c;
    }
  }

  const required: (keyof ParsedLeadSheetRow)[] = [
    "dateTimeRaw",
    "fullName",
    "email",
    "phone",
    "utmContent",
    "utmMedium",
    "utmSource",
    "utmCampaign",
  ];
  for (const k of required) {
    if (colMap[k] === undefined) {
      return {
        rows: [],
        error: `Missing required column for "${k}" (check header spelling)`,
      };
    }
  }

  const rows: ParsedLeadSheetRow[] = [];
  for (let r = 1; r < grid.length; r += 1) {
    const line = grid[r];
    const get = (k: keyof ParsedLeadSheetRow): string => {
      const idx = colMap[k];
      if (idx === undefined || idx >= line.length) {
        return "";
      }
      return line[idx].trim();
    };
    const email = get("email");
    if (email === "") {
      continue;
    }
    rows.push({
      dateTimeRaw: get("dateTimeRaw"),
      fullName: get("fullName"),
      email,
      phone: get("phone"),
      utmContent: get("utmContent"),
      utmMedium: get("utmMedium"),
      utmSource: get("utmSource"),
      utmCampaign: get("utmCampaign"),
    });
  }

  return { rows, error: null };
}
