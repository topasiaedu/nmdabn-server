/**
 * Pivot helpers shared by all four all-runs dashboard API routes.
 * Convert flat RPC rows → { columns, sections } for the ColumnTable component.
 */

export interface RunColumn {
  run_id: string;
  /** "Mar 4" style short label. */
  label: string;
}

export interface ColumnTableRow {
  label: string;
  total: number | null;
  per_run: (number | null)[];
  isRate?: boolean;
  isSubRow?: boolean;
}

export interface ColumnTableSection {
  key: string;
  label: string;
  rows: ColumnTableRow[];
}

export interface AllRunsPayload {
  columns: RunColumn[];
  sections: ColumnTableSection[];
}

/** Format a TIMESTAMPTZ string as "Mar 4" (short month + day, no year). */
export function formatRunDate(isoString: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    }).format(new Date(isoString));
  } catch {
    return isoString.slice(0, 10);
  }
}

/** Build an ordered, deduplicated list of run columns from flat RPC rows. */
export function buildRunColumns(
  rows: Array<{ run_id: string; run_start_at: string }>
): RunColumn[] {
  const seen = new Set<string>();
  const cols: Array<{ run_id: string; start_at: string }> = [];
  for (const r of rows) {
    if (!seen.has(r.run_id)) {
      seen.add(r.run_id);
      cols.push({ run_id: r.run_id, start_at: r.run_start_at });
    }
  }
  cols.sort((a, b) => a.start_at.localeCompare(b.start_at));
  return cols.map((c) => ({ run_id: c.run_id, label: formatRunDate(c.start_at) }));
}

/**
 * Pivot flat traffic / show-up style rows (section_key, row_label, value per run)
 * into ColumnTableSection[].
 */
export function pivotCountRows(
  flatRows: Array<{
    run_id: string;
    section_key: string;
    section_label: string;
    row_label: string;
    lead_count: number;
  }>,
  columns: RunColumn[]
): ColumnTableSection[] {
  const runIndex = new Map<string, number>(
    columns.map((c, i) => [c.run_id, i])
  );

  /** section_key → section_label */
  const sectionLabels = new Map<string, string>();
  /** section_key → row_label → per_run counts */
  const sectionRows = new Map<string, Map<string, (number | null)[]>>();

  for (const row of flatRows) {
    sectionLabels.set(row.section_key, row.section_label);

    if (!sectionRows.has(row.section_key)) {
      sectionRows.set(row.section_key, new Map());
    }
    const rowMap = sectionRows.get(row.section_key);
    if (rowMap === undefined) continue;

    if (!rowMap.has(row.row_label)) {
      rowMap.set(row.row_label, new Array<number | null>(columns.length).fill(null));
    }
    const perRun = rowMap.get(row.row_label);
    if (perRun === undefined) continue;

    const idx = runIndex.get(row.run_id);
    if (idx !== undefined) {
      perRun[idx] = (perRun[idx] ?? 0) + row.lead_count;
    }
  }

  const sections: ColumnTableSection[] = [];
  for (const [sectionKey, rowMap] of sectionRows) {
    const rows: ColumnTableRow[] = [];
    for (const [rowLabel, perRun] of rowMap) {
      const total = perRun.reduce<number>(
        (acc, v) => acc + (v ?? 0),
        0
      );
      rows.push({ label: rowLabel, total, per_run: perRun });
    }
    rows.sort((a, b) => (b.total ?? 0) - (a.total ?? 0));
    sections.push({
      key: sectionKey,
      label: sectionLabels.get(sectionKey) ?? sectionKey,
      rows,
    });
  }
  return sections;
}
