import type { AgencyRow } from "../types";
import {
  buildDashboardAuthHeaders,
  isRecord,
  parseApiSuccessResponse,
} from "@/lib/dashboard-api-response";

function isAgencyRow(v: unknown): v is AgencyRow {
  if (!isRecord(v)) {
    return false;
  }
  const sr = v.showup_rate;
  const cr = v.conversion_rate;
  const spend = v.ad_spend;
  const cpl = v.cpl;
  const cpa = v.cpa;
  if (typeof sr !== "number" && sr !== null) {
    return false;
  }
  if (typeof cr !== "number" && cr !== null) {
    return false;
  }
  if (typeof spend !== "number" && spend !== null) {
    return false;
  }
  if (typeof cpl !== "number" && cpl !== null) {
    return false;
  }
  if (typeof cpa !== "number" && cpa !== null) {
    return false;
  }
  return (
    typeof v.agency_line === "string" &&
    typeof v.webinar_run_id === "string" &&
    typeof v.run_label === "string" &&
    typeof v.leads === "number" &&
    typeof v.showed === "number" &&
    typeof v.buyers === "number"
  );
}

/**
 * GET /api/dashboard/agency — KPIs per agency line.
 */
export async function fetchAgencyStats(
  token: string,
  workspaceId: string,
  projectId: string,
  webinarRunId: string,
  dateFrom: string | null,
  dateTo: string | null
): Promise<AgencyRow[]> {
  const qs = new URLSearchParams({
    workspace_id: workspaceId,
    project_id: projectId,
    webinar_run_id: webinarRunId,
  });
  if (dateFrom !== null) {
    qs.set("date_from", dateFrom);
  }
  if (dateTo !== null) {
    qs.set("date_to", dateTo);
  }
  const res = await fetch(`/api/dashboard/agency?${qs.toString()}`, {
    headers: buildDashboardAuthHeaders(token),
  });
  const body = await parseApiSuccessResponse(res);
  const data = body.data;
  if (!Array.isArray(data)) {
    return [];
  }
  return data.filter(isAgencyRow);
}
