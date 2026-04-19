import { type NextRequest, NextResponse } from "next/server";
import { supabase } from "@/config/supabase";
import { env } from "@/config/env";
import { nextResponseFromGuard } from "@/lib/guard-response";
import { requireAuthAndWorkspace } from "@/middleware/workspace";
import { getZoomAccessToken } from "@/services/zoom-token";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

/** Shape of a single event returned to the client. */
export type ZoomEventItem = {
  zoom_id: string;
  topic: string;
  start_time: string;
  /** Duration in minutes (0 if unknown). */
  duration_minutes: number;
  timezone: string;
  zoom_source_type: "webinar" | "meeting";
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Fetches ALL pages for a single Zoom list call, following next_page_token.
 * `endpoint` should be a full path + query string, e.g. `/users/me/webinars?type=past_webinars&from=2025-01-01&to=2025-01-31`
 */
async function fetchZoomListAllPages(
  accessToken: string,
  endpoint: string
): Promise<Record<string, unknown>[]> {
  const isWebinar = endpoint.includes("/webinar");
  const responseKey = isWebinar ? "webinars" : "meetings";
  const collected: Record<string, unknown>[] = [];

  let nextPageToken: string | null = null;

  do {
    const url = new URL(`https://api.zoom.us/v2${endpoint}`);
    url.searchParams.set("page_size", "300");
    if (nextPageToken !== null && nextPageToken !== "") {
      url.searchParams.set("next_page_token", nextPageToken);
    }

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!res.ok) {
      const body = await res.text();
      // Silently stop on 4xx rather than throwing — some date ranges may have no data
      if (res.status >= 400 && res.status < 500) break;
      throw new Error(
        `Zoom API ${endpoint} HTTP ${String(res.status)}: ${body.slice(0, 300)}`
      );
    }

    const json: unknown = await res.json();
    if (!isRecord(json)) break;

    const items = json[responseKey];
    if (Array.isArray(items)) {
      collected.push(...(items as Record<string, unknown>[]));
    }

    const token = json["next_page_token"];
    nextPageToken = typeof token === "string" && token !== "" ? token : null;
  } while (nextPageToken !== null);

  return collected;
}

/**
 * Fetches all past WEBINARS for a specific Zoom user with full pagination.
 * Zoom's past_webinars type returns all historical records without needing date
 * filters — confirmed via direct API probe (total_records is always accurate).
 */
async function fetchAllPastWebinars(
  accessToken: string,
  zoomUserId: string
): Promise<Record<string, unknown>[]> {
  return fetchZoomListAllPages(
    accessToken,
    `/users/${zoomUserId}/webinars?type=past_webinars`
  ).catch(() => []);
}

/**
 * Fetches all past MEETINGS for a specific Zoom user with full pagination.
 * The previousMeetings type does not support from/to date filtering.
 * Requires the S2S app to have meeting:read:list_meetings scope.
 */
async function fetchAllPastMeetings(
  accessToken: string,
  zoomUserId: string
): Promise<Record<string, unknown>[]> {
  return fetchZoomListAllPages(
    accessToken,
    `/users/${zoomUserId}/meetings?type=previousMeetings`
  ).catch(() => []);
}

/**
 * Fetches all upcoming (scheduled) events for a specific Zoom user with full pagination.
 * basePath should already include the user segment, e.g. `/users/email%40example.com/webinars`
 */
async function fetchAllUpcomingZoomEvents(
  accessToken: string,
  basePath: string
): Promise<Record<string, unknown>[]> {
  return fetchZoomListAllPages(
    accessToken,
    `${basePath}?type=scheduled`
  ).catch(() => []);
}

/**
 * GET /api/projects/:id/zoom-events
 *
 * Returns past + upcoming webinars and meetings from the project's Zoom account.
 * Requires the project to have Zoom credentials configured.
 */
export async function GET(
  request: NextRequest,
  context: RouteContext
): Promise<NextResponse> {
  const session = await requireAuthAndWorkspace(request, {});
  if (!session.ok) {
    return nextResponseFromGuard(session);
  }

  if (!env.encryptionKeyLoaded) {
    return NextResponse.json(
      { success: false, error: "Server encryption is not configured" },
      { status: 503 }
    );
  }

  const { id: projectId } = await context.params;

  // Verify project belongs to this workspace
  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("id, zoom_client_id, zoom_user_id")
    .eq("id", projectId)
    .eq("workspace_id", session.workspaceId)
    .maybeSingle();

  if (projectError !== null || project === null) {
    return NextResponse.json(
      { success: false, error: "Project not found" },
      { status: 404 }
    );
  }

  if (project.zoom_client_id === null || project.zoom_client_id === "") {
    return NextResponse.json(
      {
        success: false,
        error:
          "This project has no Zoom credentials. Configure them in Project Settings → Zoom tab.",
      },
      { status: 400 }
    );
  }

  if (project.zoom_user_id === null || project.zoom_user_id === "") {
    return NextResponse.json(
      {
        success: false,
        error:
          "This project has no Host Email set. Add the host's Zoom email in Project Settings → Zoom tab.",
      },
      { status: 400 }
    );
  }

  // Use the configured host email as the user identifier in all Zoom API calls.
  // Zoom accepts email addresses as userId in /v2/users/{userId}/... endpoints.
  const zoomUserId = encodeURIComponent(project.zoom_user_id);

  let accessToken: string;
  try {
    accessToken = await getZoomAccessToken(projectId, supabase);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Token exchange failed";
    return NextResponse.json(
      { success: false, error: `Zoom authentication failed: ${msg}` },
      { status: 400 }
    );
  }

  try {
    // Fetch Zoom events and existing webinar runs for this project in parallel.
    const [
      upcomingWebinars,
      pastWebinars,
      upcomingMeetings,
      pastMeetings,
      existingRunsResult,
    ] = await Promise.all([
      fetchAllUpcomingZoomEvents(accessToken, `/users/${zoomUserId}/webinars`),
      fetchAllPastWebinars(accessToken, zoomUserId),
      fetchAllUpcomingZoomEvents(accessToken, `/users/${zoomUserId}/meetings`),
      fetchAllPastMeetings(accessToken, zoomUserId),
      supabase
        .from("webinar_runs")
        .select("zoom_meeting_id")
        .eq("project_id", projectId),
    ]);

    // Build a set of already-imported Zoom IDs so we can exclude them from results.
    const importedZoomIds = new Set<string>();
    if (existingRunsResult.data !== null) {
      for (const run of existingRunsResult.data) {
        const mid = run.zoom_meeting_id;
        if (typeof mid === "string" && mid.trim() !== "") {
          importedZoomIds.add(mid.trim());
        }
      }
    }

    const toItem = (
      raw: Record<string, unknown>,
      sourceType: "webinar" | "meeting"
    ): ZoomEventItem | null => {
      const zoomId = raw["id"];
      const topic = raw["topic"];
      const startTime = raw["start_time"];
      const duration = raw["duration"];
      const tz = raw["timezone"];

      const zoomIdStr =
        typeof zoomId === "number"
          ? String(zoomId)
          : typeof zoomId === "string"
          ? zoomId.trim()
          : null;

      if (zoomIdStr === null || zoomIdStr === "") return null;
      if (typeof topic !== "string" || topic.trim() === "") return null;
      if (typeof startTime !== "string" || startTime.trim() === "") return null;

      return {
        zoom_id: zoomIdStr,
        topic: topic.trim(),
        start_time: startTime.trim(),
        duration_minutes:
          typeof duration === "number" && Number.isFinite(duration)
            ? Math.max(0, Math.floor(duration))
            : 0,
        timezone:
          typeof tz === "string" && tz.trim() !== "" ? tz.trim() : "UTC",
        zoom_source_type: sourceType,
      };
    };

    const allItems: ZoomEventItem[] = [];
    const seen = new Set<string>();

    for (const raw of [
      ...upcomingWebinars.map((r) => ({ raw: r, type: "webinar" as const })),
      ...pastWebinars.map((r) => ({ raw: r, type: "webinar" as const })),
      ...upcomingMeetings.map((r) => ({ raw: r, type: "meeting" as const })),
      ...pastMeetings.map((r) => ({ raw: r, type: "meeting" as const })),
    ]) {
      const item = toItem(raw.raw, raw.type);
      if (item === null || seen.has(item.zoom_id)) continue;
      // Skip events that are already imported as webinar runs for this project
      if (importedZoomIds.has(item.zoom_id)) continue;
      seen.add(item.zoom_id);
      allItems.push(item);
    }

    // Sort: upcoming first (start_time desc from today), then past (most recent first)
    const now = Date.now();
    allItems.sort((a, b) => {
      const aMs = Date.parse(a.start_time);
      const bMs = Date.parse(b.start_time);
      const aUpcoming = aMs >= now;
      const bUpcoming = bMs >= now;
      if (aUpcoming !== bUpcoming) return aUpcoming ? -1 : 1;
      // Both upcoming: earliest first; both past: most recent first
      return aUpcoming ? aMs - bMs : bMs - aMs;
    });

    return NextResponse.json({ success: true, data: allItems });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to fetch Zoom events";
    console.error("zoom-events:", msg);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
