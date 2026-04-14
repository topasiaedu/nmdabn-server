import type { ShowUpRow } from "../types";
import {
  buildDashboardAuthHeaders,
  isRecord,
  parseApiSuccessResponse,
} from "@/lib/dashboard-api-response";

function isShowUpRow(v: unknown): v is ShowUpRow {
  if (!isRecord(v)) {
    return false;
  }
  const rate = v.showup_rate;
  if (typeof rate !== "number" && rate !== null) {
    return false;
  }
  return (
    typeof v.line_bucket === "string" &&
    typeof v.denominator === "number" &&
    typeof v.numerator === "number"
  );
}

/**
 * GET /api/dashboard/showup — NM / OM / MISSING buckets.
 */
export async function fetchShowUpStats(
  token: string,
  workspaceId: string,
  projectId: string,
  webinarRunId: string,
  dateFrom: string | null,
  dateTo: string | null
): Promise<ShowUpRow[]> {
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
  const res = await fetch(`/api/dashboard/showup?${qs.toString()}`, {
    headers: buildDashboardAuthHeaders(token),
  });
  const body = await parseApiSuccessResponse(res);
  const data = body.data;
  if (!Array.isArray(data)) {
    return [];
  }
  return data.filter(isShowUpRow);
}
