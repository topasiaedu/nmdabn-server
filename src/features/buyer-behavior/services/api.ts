import type { BuyerBehaviorRow } from "../types";
import {
  buildDashboardAuthHeaders,
  isRecord,
  parseApiSuccessResponse,
} from "@/lib/dashboard-api-response";

function isBuyerBehaviorRow(v: unknown): v is BuyerBehaviorRow {
  if (!isRecord(v)) {
    return false;
  }
  const b = v.bigint_val;
  const n = v.numeric_val;
  const p = v.pct;
  if (typeof b !== "number" && b !== null) {
    return false;
  }
  if (typeof n !== "number" && n !== null) {
    return false;
  }
  if (typeof p !== "number" && p !== null) {
    return false;
  }
  return (
    typeof v.section === "string" &&
    typeof v.label === "string" &&
    typeof v.sort_key === "number"
  );
}

/**
 * GET /api/dashboard/buyer-behavior — sectioned stats.
 */
export async function fetchBuyerBehaviorStats(
  token: string,
  workspaceId: string,
  projectId: string,
  webinarRunId: string,
  dateFrom: string | null,
  dateTo: string | null
): Promise<BuyerBehaviorRow[]> {
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
  const res = await fetch(`/api/dashboard/buyer-behavior?${qs.toString()}`, {
    headers: buildDashboardAuthHeaders(token),
  });
  const body = await parseApiSuccessResponse(res);
  const data = body.data;
  if (!Array.isArray(data)) {
    return [];
  }
  return data.filter(isBuyerBehaviorRow);
}
