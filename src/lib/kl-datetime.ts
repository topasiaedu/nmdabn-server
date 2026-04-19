/**
 * Parses datetimes exported from Google Sheets in **Asia/Kuala_Lumpur** (GMT+8).
 * Expected pattern: D/M/YYYY H:mm or DD/M/YYYY HH:mm (as in CAE webinar sheets).
 */

const KL_OFFSET = "+08:00";

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/**
 * @returns ISO 8601 UTC string, or null if parsing fails.
 */
export function parseKualaLumpurSheetDateTime(raw: string): string | null {
  const t = raw.trim();
  if (t === "") {
    return null;
  }
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})$/.exec(t);
  if (m === null) {
    return null;
  }
  const day = parseInt(m[1], 10);
  const month = parseInt(m[2], 10);
  const year = parseInt(m[3], 10);
  const hour = parseInt(m[4], 10);
  const minute = parseInt(m[5], 10);
  if (
    !Number.isFinite(day) ||
    !Number.isFinite(month) ||
    !Number.isFinite(year) ||
    !Number.isFinite(hour) ||
    !Number.isFinite(minute)
  ) {
    return null;
  }
  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31 ||
    hour > 23 ||
    minute > 59
  ) {
    return null;
  }

  const isoLocal = `${year}-${pad2(month)}-${pad2(day)}T${pad2(hour)}:${pad2(minute)}:00${KL_OFFSET}`;
  const d = new Date(isoLocal);
  if (Number.isNaN(d.getTime())) {
    return null;
  }
  return d.toISOString();
}
