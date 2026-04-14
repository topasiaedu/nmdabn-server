import { supabase } from "../config/supabase";
import type { Database } from "../database.types";

type OccRpcRow =
  Database["public"]["Functions"]["traffic_occupation_breakdown"]["Returns"][number];
type SourceRpcRow =
  Database["public"]["Functions"]["traffic_lead_source_breakdown"]["Returns"][number];

export interface TrafficRunColumn {
  id: string;
  display_label: string;
  event_start_at: string;
}

export interface TrafficBreakdownRow {
  label: string;
  total: number;
  countsByRunId: Record<string, number>;
  /** Share of section grand total (null if no leads). */
  pctOfSection: number | null;
  /** Per-run share of that run's column total (null if column empty). */
  pctOfRunColumn: Record<string, number | null>;
}

export interface TrafficSectionPayload {
  grandTotal: number;
  runColumnTotals: Record<string, number>;
  rows: TrafficBreakdownRow[];
}

export interface TrafficDashboardPayload {
  line: string;
  location_id: string;
  occupation_field_id: string;
  date_from: string | null;
  date_to: string | null;
  runs: TrafficRunColumn[];
  occupation: TrafficSectionPayload;
  leadSource: TrafficSectionPayload;
  /** Set when Traffic is loaded via project (multi-location). */
  project_id?: string;
  project_name?: string;
}

function runKey(runId: string | null): string {
  return runId === null || runId === "" ? "__unassigned__" : runId;
}

/**
 * Loads active webinar runs for column order and labels.
 */
export async function fetchWebinarRunColumns(
  locationId: string
): Promise<TrafficRunColumn[]> {
  const { data, error } = await supabase
    .from("webinar_runs")
    .select("id, display_label, event_start_at, is_active")
    .eq("location_id", locationId)
    .order("event_start_at", { ascending: true });

  if (error) {
    throw new Error(`webinar_runs query failed: ${error.message}`);
  }

  const rows = data ?? [];
  return rows
    .filter((r) => r.is_active !== false)
    .map((r) => ({
      id: r.id,
      display_label: r.display_label,
      event_start_at: r.event_start_at,
    }));
}

function pivotBreakdown(
  flat: { labelKey: string; webinar_run_id: string | null; lead_count: number }[],
  runColumns: TrafficRunColumn[]
): TrafficSectionPayload {
  const runIds = runColumns.map((r) => r.id);
  const runIdSet = new Set(runIds);

  /** label -> runKey -> count */
  const acc = new Map<string, Map<string, number>>();

  for (const row of flat) {
    const label = row.labelKey;
    const rk = runKey(row.webinar_run_id);
    if (!acc.has(label)) {
      acc.set(label, new Map());
    }
    const inner = acc.get(label);
    if (inner === undefined) {
      continue;
    }
    const prev = inner.get(rk) ?? 0;
    inner.set(rk, prev + Number(row.lead_count));
  }

  const runColumnTotals: Record<string, number> = {};
  for (const id of runIds) {
    runColumnTotals[id] = 0;
  }
  runColumnTotals.__unassigned__ = 0;

  for (const [, m] of acc) {
    for (const [rk, c] of m) {
      if (rk === "__unassigned__") {
        runColumnTotals.__unassigned__ += c;
      } else if (runIdSet.has(rk)) {
        runColumnTotals[rk] += c;
      } else {
        runColumnTotals.__unassigned__ += c;
      }
    }
  }

  let grandTotal = 0;
  const rowTotals = new Map<string, number>();
  for (const [label, m] of acc) {
    let t = 0;
    for (const [, c] of m) {
      t += c;
    }
    rowTotals.set(label, t);
    grandTotal += t;
  }

  const rows: TrafficBreakdownRow[] = [];
  const sortedLabels = [...acc.keys()].sort((a, b) => a.localeCompare(b));

  for (const label of sortedLabels) {
    const m = acc.get(label);
    if (m === undefined) {
      continue;
    }
    const total = rowTotals.get(label) ?? 0;
    const countsByRunId: Record<string, number> = {};
    for (const id of runIds) {
      countsByRunId[id] = m.get(id) ?? 0;
    }
    const unassigned = m.get("__unassigned__") ?? 0;
    if (unassigned > 0) {
      countsByRunId.__unassigned__ = unassigned;
    }

    const pctOfSection =
      grandTotal > 0 ? (total / grandTotal) * 100 : null;

    const pctOfRunColumn: Record<string, number | null> = {};
    for (const id of runIds) {
      const colTotal = runColumnTotals[id] ?? 0;
      const cell = countsByRunId[id] ?? 0;
      pctOfRunColumn[id] =
        colTotal > 0 ? (cell / colTotal) * 100 : null;
    }
    const uTot = runColumnTotals.__unassigned__ ?? 0;
    const uCell = countsByRunId.__unassigned__ ?? 0;
    pctOfRunColumn.__unassigned__ =
      uTot > 0 ? (uCell / uTot) * 100 : null;

    rows.push({
      label,
      total,
      countsByRunId,
      pctOfSection,
      pctOfRunColumn,
    });
  }

  return {
    grandTotal,
    runColumnTotals,
    rows,
  };
}

/**
 * Fetches Traffic dashboard payload for one agency line (tag filter).
 */
export async function buildTrafficDashboardPayload(input: {
  locationId: string;
  lineKey: string;
  lineTags: string[];
  occupationFieldId: string;
  dateFrom: string | null;
  dateTo: string | null;
  projectId?: string;
  projectName?: string;
}): Promise<TrafficDashboardPayload> {
  const runs = await fetchWebinarRunColumns(input.locationId);

  const occArgs = {
    p_location_id: input.locationId,
    p_line_tags: input.lineTags,
    p_occupation_field_id: input.occupationFieldId,
    p_date_from: input.dateFrom ?? undefined,
    p_date_to: input.dateTo ?? undefined,
  };

  const { data: occData, error: occErr } = await supabase.rpc(
    "traffic_occupation_breakdown",
    occArgs
  );

  if (occErr) {
    throw new Error(`traffic_occupation_breakdown: ${occErr.message}`);
  }

  const { data: srcData, error: srcErr } = await supabase.rpc(
    "traffic_lead_source_breakdown",
    {
      p_location_id: input.locationId,
      p_line_tags: input.lineTags,
      p_date_from: input.dateFrom ?? undefined,
      p_date_to: input.dateTo ?? undefined,
    }
  );

  if (srcErr) {
    throw new Error(`traffic_lead_source_breakdown: ${srcErr.message}`);
  }

  const occFlat: { labelKey: string; webinar_run_id: string | null; lead_count: number }[] =
    (occData as OccRpcRow[] | null)?.map((r) => ({
      labelKey: r.occupation_label,
      webinar_run_id: r.webinar_run_id,
      lead_count: r.lead_count,
    })) ?? [];

  const srcFlat: { labelKey: string; webinar_run_id: string | null; lead_count: number }[] =
    (srcData as SourceRpcRow[] | null)?.map((r) => ({
      labelKey: r.lead_source_key,
      webinar_run_id: r.webinar_run_id,
      lead_count: r.lead_count,
    })) ?? [];

  const base: TrafficDashboardPayload = {
    line: input.lineKey,
    location_id: input.locationId,
    occupation_field_id: input.occupationFieldId,
    date_from: input.dateFrom,
    date_to: input.dateTo,
    runs,
    occupation: pivotBreakdown(occFlat, runs),
    leadSource: pivotBreakdown(srcFlat, runs),
  };
  if (input.projectId !== undefined) {
    base.project_id = input.projectId;
  }
  if (input.projectName !== undefined) {
    base.project_name = input.projectName;
  }
  return base;
}
