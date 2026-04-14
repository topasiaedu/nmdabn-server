import { type NextRequest, NextResponse } from "next/server";
import { env } from "@/config/env";
import { supabase } from "@/config/supabase";
import { nextResponseFromGuard } from "@/lib/guard-response";
import { parseJsonObjectBody } from "@/lib/parse-json-body";
import { requireAuthAndWorkspace } from "@/middleware/workspace";
import { syncZoomParticipantsForRun } from "@/services/zoom-participants-sync";

export const runtime = "nodejs";

/**
 * POST /api/actions/sync/zoom — triggers Zoom participant sync for one webinar run.
 * Body: { webinar_run_id: string, workspace_id: string }
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

  const webinarRunIdRaw = parsed.body["webinar_run_id"];
  if (typeof webinarRunIdRaw !== "string" || webinarRunIdRaw.trim() === "") {
    return NextResponse.json(
      { success: false, error: "webinar_run_id is required" },
      { status: 400 }
    );
  }
  const webinarRunId = webinarRunIdRaw.trim();

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
    .eq("workspace_id", session.workspaceId)
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
    const { inserted, skipped } = await syncZoomParticipantsForRun(
      webinarRunId,
      supabase
    );
    return NextResponse.json({
      success: true,
      inserted,
      skipped,
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
