import type {
  ProjectItem,
  TrafficBreakdownRow,
  TrafficDashboardPayload,
  TrafficRunColumn,
  TrafficSectionPayload,
  WebinarRunListItem,
  WorkspaceItem,
} from "../types";

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function authHeaders(token: string): HeadersInit {
  const headers: Record<string, string> = {};
  if (token.trim() !== "") {
    headers.Authorization = `Bearer ${token}`;
  }
  const legacyKey = process.env.NEXT_PUBLIC_TRAFFIC_KEY?.trim();
  if (legacyKey !== undefined && legacyKey !== "") {
    headers["x-traffic-key"] = legacyKey;
  }
  return headers;
}

async function parseResponse(res: Response): Promise<Record<string, unknown>> {
  const body: unknown = await res.json();
  if (!isRecord(body)) {
    throw new Error("Invalid JSON response");
  }
  if (!res.ok || body.success === false) {
    const err = body.error;
    throw new Error(typeof err === "string" ? err : `HTTP ${res.status}`);
  }
  return body;
}

function isWorkspaceItem(v: unknown): v is WorkspaceItem {
  if (!isRecord(v)) {
    return false;
  }
  return (
    typeof v.id === "string" &&
    typeof v.name === "string" &&
    typeof v.role === "string"
  );
}

function isProjectItem(v: unknown): v is ProjectItem {
  if (!isRecord(v)) {
    return false;
  }
  if (typeof v.id !== "string" || typeof v.name !== "string") {
    return false;
  }
  const ghl = v.ghl_location_id;
  if (ghl !== null && typeof ghl !== "string") {
    return false;
  }
  const occKey = v.traffic_occupation_field_key;
  if (occKey !== null && typeof occKey !== "string") {
    return false;
  }
  const tags = v.traffic_agency_line_tags;
  if (tags !== null && !isRecord(tags)) {
    return false;
  }
  return true;
}

function isWebinarRunListItem(v: unknown): v is WebinarRunListItem {
  if (!isRecord(v)) {
    return false;
  }
  const pid = v.project_id;
  if (pid !== null && typeof pid !== "string") {
    return false;
  }
  return (
    typeof v.id === "string" &&
    typeof v.display_label === "string"
  );
}

function isTrafficRunColumn(v: unknown): v is TrafficRunColumn {
  return (
    isRecord(v) &&
    typeof v.id === "string" &&
    typeof v.display_label === "string"
  );
}

function isTrafficBreakdownRow(v: unknown): v is TrafficBreakdownRow {
  if (!isRecord(v)) {
    return false;
  }
  const pct = v.pctOfSection;
  if (typeof pct !== "number" && pct !== null) {
    return false;
  }
  return (
    typeof v.label === "string" &&
    typeof v.total === "number" &&
    isRecord(v.countsByRunId) &&
    isRecord(v.pctOfRunColumn)
  );
}

function isTrafficSectionPayload(v: unknown): v is TrafficSectionPayload {
  if (!isRecord(v)) {
    return false;
  }
  if (typeof v.grandTotal !== "number" || !isRecord(v.runColumnTotals)) {
    return false;
  }
  if (!Array.isArray(v.rows)) {
    return false;
  }
  return v.rows.every(isTrafficBreakdownRow);
}

export async function fetchWorkspaces(
  accessToken: string
): Promise<WorkspaceItem[]> {
  const res = await fetch("/api/workspaces", {
    headers: authHeaders(accessToken),
  });
  const body = await parseResponse(res);
  const data = body.data;
  if (!Array.isArray(data)) {
    return [];
  }
  return data.filter(isWorkspaceItem);
}

export async function fetchProjects(
  accessToken: string,
  workspaceId: string
): Promise<ProjectItem[]> {
  const qs = new URLSearchParams({ workspace_id: workspaceId });
  const res = await fetch(`/api/projects?${qs.toString()}`, {
    headers: authHeaders(accessToken),
  });
  const body = await parseResponse(res);
  const data = body.data;
  if (!Array.isArray(data)) {
    return [];
  }
  return data.filter(isProjectItem);
}

/**
 * Lists webinar runs for the workspace (caller filters by project if needed).
 */
export async function fetchWebinarRuns(
  accessToken: string,
  workspaceId: string
): Promise<WebinarRunListItem[]> {
  const qs = new URLSearchParams({ workspace_id: workspaceId });
  const res = await fetch(`/api/webinar-runs?${qs.toString()}`, {
    headers: authHeaders(accessToken),
  });
  const body = await parseResponse(res);
  const data = body.data;
  if (!Array.isArray(data)) {
    return [];
  }
  return data.filter(isWebinarRunListItem);
}

export async function fetchTrafficLines(
  accessToken: string,
  workspaceId: string,
  projectId: string
): Promise<string[]> {
  const qs = new URLSearchParams({
    workspace_id: workspaceId,
    project_id: projectId,
  });
  const res = await fetch(`/api/dashboard/traffic/lines?${qs.toString()}`, {
    headers: authHeaders(accessToken),
  });
  const body = await parseResponse(res);
  const lines = body.lines;
  if (!Array.isArray(lines)) {
    return [];
  }
  return lines.filter((x): x is string => typeof x === "string");
}

function isTrafficDashboardPayload(v: unknown): v is TrafficDashboardPayload {
  if (!isRecord(v)) {
    return false;
  }
  if (
    typeof v.line !== "string" ||
    typeof v.location_id !== "string" ||
    typeof v.occupation_field_id !== "string"
  ) {
    return false;
  }
  if (!Array.isArray(v.runs) || !v.runs.every(isTrafficRunColumn)) {
    return false;
  }
  if (!isTrafficSectionPayload(v.occupation)) {
    return false;
  }
  if (!isTrafficSectionPayload(v.leadSource)) {
    return false;
  }
  const pn = v.project_name;
  if (pn !== undefined && typeof pn !== "string") {
    return false;
  }
  return true;
}

export async function fetchTrafficDashboard(
  accessToken: string,
  workspaceId: string,
  projectId: string,
  line: string,
  dateFrom: string | null,
  dateTo: string | null
): Promise<TrafficDashboardPayload> {
  const qs = new URLSearchParams({
    workspace_id: workspaceId,
    project_id: projectId,
    line,
  });
  if (dateFrom !== null && dateFrom.trim() !== "") {
    qs.set("date_from", dateFrom.trim());
  }
  if (dateTo !== null && dateTo.trim() !== "") {
    qs.set("date_to", dateTo.trim());
  }
  const res = await fetch(`/api/dashboard/traffic?${qs.toString()}`, {
    headers: authHeaders(accessToken),
  });
  const body = await parseResponse(res);
  const data = body.data;
  if (!isTrafficDashboardPayload(data)) {
    throw new Error("Traffic payload missing from API response.");
  }
  return data;
}

export async function saveProjectSettings(params: {
  accessToken: string;
  workspaceId: string;
  projectId: string;
  projectName: string;
  ghlLocationId: string;
  occupationFieldKey: string;
  lineTagsDraft: string;
}): Promise<void> {
  let parsedTags: unknown;
  try {
    parsedTags = JSON.parse(params.lineTagsDraft);
  } catch {
    throw new Error("Line tags JSON must be valid JSON.");
  }
  if (!isRecord(parsedTags)) {
    throw new Error("Line tags JSON must be an object.");
  }

  const qs = new URLSearchParams({ workspace_id: params.workspaceId });
  const res = await fetch(
    `/api/projects/${params.projectId}?${qs.toString()}`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders(params.accessToken),
      },
      body: JSON.stringify({
        name: params.projectName.trim(),
        ghl_location_id:
          params.ghlLocationId.trim() === ""
            ? null
            : params.ghlLocationId.trim(),
        traffic_occupation_field_key:
          params.occupationFieldKey.trim() === ""
            ? null
            : params.occupationFieldKey.trim(),
        traffic_agency_line_tags: parsedTags,
      }),
    }
  );
  await parseResponse(res);
}
