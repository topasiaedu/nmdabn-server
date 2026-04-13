import type {
  ProjectItem,
  TrafficDashboardPayload,
  WorkspaceItem,
} from "../types";

function apiPath(path: string): string {
  const base = process.env.NEXT_PUBLIC_API_BASE_URL?.trim();
  return base !== undefined && base !== ""
    ? `${base.replace(/\/$/, "")}${path}`
    : path;
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

async function parseResponse<T>(res: Response): Promise<T> {
  const body = (await res.json()) as T & { success?: boolean; error?: string };
  if (!res.ok || body.success === false) {
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
  return body;
}

export async function fetchWorkspaces(
  accessToken: string
): Promise<WorkspaceItem[]> {
  const res = await fetch(apiPath("/api/workspaces"), {
    headers: authHeaders(accessToken),
  });
  const body = await parseResponse<{ success: boolean; data?: WorkspaceItem[] }>(
    res
  );
  return body.data ?? [];
}

export async function fetchProjects(
  accessToken: string,
  workspaceId: string
): Promise<ProjectItem[]> {
  const qs = new URLSearchParams({ workspace_id: workspaceId });
  const res = await fetch(apiPath(`/api/projects?${qs.toString()}`), {
    headers: authHeaders(accessToken),
  });
  const body = await parseResponse<{ success: boolean; data?: ProjectItem[] }>(
    res
  );
  return body.data ?? [];
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
  const res = await fetch(apiPath(`/api/dashboard/traffic/lines?${qs.toString()}`), {
    headers: authHeaders(accessToken),
  });
  const body = await parseResponse<{ success: boolean; lines?: string[] }>(res);
  return body.lines ?? [];
}

export async function fetchTrafficDashboard(
  accessToken: string,
  workspaceId: string,
  projectId: string,
  line: string
): Promise<TrafficDashboardPayload> {
  const qs = new URLSearchParams({
    workspace_id: workspaceId,
    project_id: projectId,
    line,
  });
  const res = await fetch(apiPath(`/api/dashboard/traffic?${qs.toString()}`), {
    headers: authHeaders(accessToken),
  });
  const body = await parseResponse<{
    success: boolean;
    data?: TrafficDashboardPayload;
  }>(res);
  if (body.data === undefined) {
    throw new Error("Traffic payload missing from API response.");
  }
  return body.data;
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
  const parsedTags = JSON.parse(params.lineTagsDraft) as unknown;
  if (
    typeof parsedTags !== "object" ||
    parsedTags === null ||
    Array.isArray(parsedTags)
  ) {
    throw new Error("Line tags JSON must be an object.");
  }

  const qs = new URLSearchParams({ workspace_id: params.workspaceId });
  const res = await fetch(apiPath(`/api/projects/${params.projectId}?${qs.toString()}`), {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(params.accessToken),
    },
    body: JSON.stringify({
      name: params.projectName.trim(),
      ghl_location_id:
        params.ghlLocationId.trim() === "" ? null : params.ghlLocationId.trim(),
      traffic_occupation_field_key:
        params.occupationFieldKey.trim() === ""
          ? null
          : params.occupationFieldKey.trim(),
      traffic_agency_line_tags: parsedTags,
    }),
  });
  await parseResponse<{ success: boolean }>(res);
}
