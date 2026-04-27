import { type NextRequest, NextResponse } from "next/server";
import { env } from "@/config/env";
import { supabase } from "@/config/supabase";
import { nextResponseFromGuard } from "@/lib/guard-response";
import { parseJsonObjectBody } from "@/lib/parse-json-body";
import { requireAuthAndWorkspace } from "@/middleware/workspace";
import { syncMetaAdsForProject } from "@/services/meta-ads-sync";

export const runtime = "nodejs";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuidString(value: string): boolean {
  return UUID_RE.test(value);
}

/**
 * POST /api/actions/sync/meta-ads — pulls Meta campaigns + insights for linked ad accounts,
 * then recomputes webinar-run spend attribution for the project.
 *
 * Body: `{ "project_id": "<uuid>" }`
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

  const projectIdRaw = parsed.body["project_id"];
  const projectId =
    typeof projectIdRaw === "string" ? projectIdRaw.trim() : "";

  if (projectId === "" || !isUuidString(projectId)) {
    return NextResponse.json(
      {
        success: false,
        error:
          "project_id is required and must be a UUID",
      },
      { status: 400 }
    );
  }

  // Optional lookback window in days; defaults to 90 (full history) so that
  // a manual "Sync Now" always fetches the complete recent window.
  const lookbackDaysRaw = parsed.body["lookback_days"];
  const lookbackDays =
    typeof lookbackDaysRaw === "number" && Number.isFinite(lookbackDaysRaw) && lookbackDaysRaw > 0
      ? Math.trunc(lookbackDaysRaw)
      : 90;

  const { data: projectRow, error: projectError } = await supabase
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .eq("workspace_id", session.workspaceId)
    .maybeSingle();

  if (projectError !== null) {
    console.error("POST /api/actions/sync/meta-ads project lookup:", projectError);
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

  try {
    const result = await syncMetaAdsForProject(projectId, supabase, lookbackDays);
    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (e) {
    const msg =
      e instanceof Error
        ? e.message
        : "Meta Ads sync failed";
    console.error("POST /api/actions/sync/meta-ads:", msg);
    return NextResponse.json(
      { success: false, error: msg },
      { status: 500 }
    );
  }
}
