import { type NextRequest, NextResponse } from "next/server";
import { env } from "@/config/env";
import { supabase } from "@/config/supabase";
import { nextResponseFromGuard } from "@/lib/guard-response";
import { parseJsonObjectBody } from "@/lib/parse-json-body";
import { requireAuthAndWorkspace } from "@/middleware/workspace";
import { syncZoomParticipantsForRun } from "@/services/zoom-participants-sync";

export const runtime = "nodejs";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuidString(value: string): boolean {
  return UUID_RE.test(value);
}

type RunSyncSummary = {
  webinar_run_id: string;
  display_label: string;
  inserted: number;
  skipped: number;
  segmentsUpserted: number;
  rollupsUpdated: number;
  /** Present when this run was not sent to Zoom (no meeting id or invalid type). */
  notice?: string;
  /** Present when Zoom or DB sync threw for this run. */
  error?: string;
};

/**
 * POST /api/actions/sync/zoom — Zoom participant report → `journey_events`.
 *
 * Body (workspace_id via query, header, or JSON):
 * - `{ webinar_run_id }` — sync one run (existing behaviour).
 * - `{ project_id }` — sync every run on that project that has a Zoom meeting id
 *   and a valid `zoom_source_type` (`meeting` | `webinar`). Per-run failures do
 *   not stop other runs.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const parsed = await parseJsonObjectBody(request);
  if (!parsed.ok) {
    return NextResponse.json(
      { success: false, error: parsed.error },
      { status: parsed.status }
    );
  }

  const session = await requireAuthAndWorkspace(request, parsed.body);
  if (!session.ok) {
    return nextResponseFromGuard(session);
  }

  if (!env.encryptionKeyLoaded) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Server encryption is not configured (missing or invalid GHL_CONNECTION_TOKEN_ENCRYPTION_KEY)",
      },
      { status: 503 }
    );
  }

  const webinarRunIdSingle =
    typeof parsed.body["webinar_run_id"] === "string"
      ? parsed.body["webinar_run_id"].trim()
      : "";
  const projectIdClean =
    typeof parsed.body["project_id"] === "string"
      ? parsed.body["project_id"].trim()
      : "";

  const hasRunId = webinarRunIdSingle !== "";
  const hasProjectId = projectIdClean !== "";

  if (hasRunId && hasProjectId) {
    return NextResponse.json(
      {
        success: false,
        error: "Send only one of webinar_run_id or project_id, not both",
      },
      { status: 400 }
    );
  }

  if (!hasRunId && !hasProjectId) {
    return NextResponse.json(
      {
        success: false,
        error: "webinar_run_id or project_id is required",
      },
      { status: 400 }
    );
  }

  if (hasProjectId) {
    return await syncZoomForProject(session.workspaceId, projectIdClean);
  }

  return await syncZoomForSingleRun(session.workspaceId, webinarRunIdSingle);
}

async function syncZoomForProject(
  workspaceId: string,
  projectId: string
): Promise<NextResponse> {
  if (!isUuidString(projectId)) {
    return NextResponse.json(
      { success: false, error: "project_id must be a valid UUID" },
      { status: 400 }
    );
  }

  const { data: projectRow, error: projectError } = await supabase
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (projectError !== null) {
    console.error("projects lookup (zoom project sync):", projectError.message);
    return NextResponse.json(
      { success: false, error: "Failed to verify project access" },
      { status: 500 }
    );
  }

  if (projectRow === null) {
    return NextResponse.json(
      { success: false, error: "Project not found or access denied" },
      { status: 404 }
    );
  }

  const { data: runs, error: runsError } = await supabase
    .from("webinar_runs")
    .select("id, display_label, zoom_meeting_id, zoom_source_type")
    .eq("project_id", projectId)
    .order("event_start_at", { ascending: false });

  if (runsError !== null) {
    console.error("webinar_runs list (zoom project sync):", runsError.message);
    return NextResponse.json(
      { success: false, error: "Failed to list webinar runs for project" },
      { status: 500 }
    );
  }

  const list = runs ?? [];
  const summaries: RunSyncSummary[] = [];
  let insertedTotal = 0;
  let skippedTotal = 0;
  let segmentsUpsertedTotal = 0;
  let rollupsUpdatedTotal = 0;

  for (const r of list) {
    const runId = r.id;
    const label =
      typeof r.display_label === "string" ? r.display_label : runId;
    const meetingRaw = r.zoom_meeting_id;
    const meeting =
      typeof meetingRaw === "string" && meetingRaw.trim() !== ""
        ? meetingRaw.trim()
        : null;
    const zst = r.zoom_source_type;

    if (meeting === null) {
      summaries.push({
        webinar_run_id: runId,
        display_label: label,
        inserted: 0,
        skipped: 0,
        segmentsUpserted: 0,
        rollupsUpdated: 0,
        notice: "skipped_no_zoom_meeting_id",
      });
      continue;
    }

    if (zst !== "meeting" && zst !== "webinar") {
      summaries.push({
        webinar_run_id: runId,
        display_label: label,
        inserted: 0,
        skipped: 0,
        segmentsUpserted: 0,
        rollupsUpdated: 0,
        notice: "skipped_invalid_zoom_source_type",
      });
      continue;
    }

    try {
      const result = await syncZoomParticipantsForRun(runId, supabase);
      insertedTotal += result.inserted;
      skippedTotal += result.skipped;
      segmentsUpsertedTotal += result.segmentsUpserted;
      rollupsUpdatedTotal += result.rollupsUpdated;
      summaries.push({
        webinar_run_id: runId,
        display_label: label,
        inserted: result.inserted,
        skipped: result.skipped,
        segmentsUpserted: result.segmentsUpserted,
        rollupsUpdated: result.rollupsUpdated,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Sync failed";
      console.error("syncZoomParticipantsForRun (project batch):", msg);
      summaries.push({
        webinar_run_id: runId,
        display_label: label,
        inserted: 0,
        skipped: 0,
        segmentsUpserted: 0,
        rollupsUpdated: 0,
        error: msg,
      });
    }
  }

  return NextResponse.json({
    success: true,
    mode: "project" as const,
    inserted: insertedTotal,
    skipped: skippedTotal,
    segmentsUpserted: segmentsUpsertedTotal,
    rollupsUpdated: rollupsUpdatedTotal,
    runs: summaries,
  });
}

async function syncZoomForSingleRun(
  workspaceId: string,
  webinarRunId: string
): Promise<NextResponse> {
  if (!isUuidString(webinarRunId)) {
    return NextResponse.json(
      { success: false, error: "webinar_run_id must be a valid UUID" },
      { status: 400 }
    );
  }

  const { data: run, error: runError } = await supabase
    .from("webinar_runs")
    .select("id, project_id")
    .eq("id", webinarRunId)
    .maybeSingle();

  if (runError !== null) {
    console.error("webinar_runs lookup:", runError.message);
    return NextResponse.json(
      { success: false, error: "Failed to load webinar run" },
      { status: 500 }
    );
  }

  /**
   * Same 404 for missing run and for runs outside the caller workspace so we do not
   * leak whether a given UUID exists in another workspace.
   */
  if (run === null) {
    return NextResponse.json(
      { success: false, error: "Webinar run not found or access denied" },
      { status: 404 }
    );
  }

  const projectId = run.project_id;
  if (projectId === null || projectId === "") {
    return NextResponse.json(
      {
        success: false,
        error: "Webinar run has no project; cannot sync",
      },
      { status: 400 }
    );
  }

  const { data: projectInWorkspace, error: projectError } = await supabase
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (projectError !== null) {
    console.error("projects workspace check:", projectError.message);
    return NextResponse.json(
      { success: false, error: "Failed to verify project access" },
      { status: 500 }
    );
  }

  if (projectInWorkspace === null) {
    return NextResponse.json(
      { success: false, error: "Webinar run not found or access denied" },
      { status: 404 }
    );
  }

  try {
    const result = await syncZoomParticipantsForRun(webinarRunId, supabase);
    return NextResponse.json({
      success: true,
      inserted: result.inserted,
      skipped: result.skipped,
      segmentsUpserted: result.segmentsUpserted,
      rollupsUpdated: result.rollupsUpdated,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Sync failed";
    console.error("syncZoomParticipantsForRun:", msg);
    return NextResponse.json(
      { success: false, error: msg },
      { status: 500 }
    );
  }
}
