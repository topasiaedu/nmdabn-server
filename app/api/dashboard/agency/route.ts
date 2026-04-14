import { type NextRequest, NextResponse } from "next/server";

import { supabase } from "@/config/supabase";
import { nextResponseFromGuard } from "@/lib/guard-response";
import { parseOptionalIsoDateParam } from "@/lib/parse-date-param";
import { requireAuthAndWorkspace } from "@/middleware/workspace";

/**
 * GET /api/dashboard/agency — Agency dashboard KPIs per line via get_agency_stats RPC.
 */
export const runtime = "nodejs";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const session = await requireAuthAndWorkspace(request);
  if (!session.ok) {
    return nextResponseFromGuard(session);
  }

  try {
    const sp = request.nextUrl.searchParams;
    const workspaceId = sp.get("workspace_id")?.trim() ?? "";
    const projectId = sp.get("project_id")?.trim() ?? "";
    const webinarRunId = sp.get("webinar_run_id")?.trim() ?? "";

    if (workspaceId === "" || projectId === "" || webinarRunId === "") {
      return NextResponse.json(
        {
          success: false,
          error:
            "workspace_id, project_id, and webinar_run_id query parameters are required",
        },
        { status: 400 }
      );
    }

    const dateFromParsed = parseOptionalIsoDateParam(sp.get("date_from"));
    if (!dateFromParsed.ok) {
      return NextResponse.json(
        { success: false, error: "Invalid date_from: must be a valid ISO date string" },
        { status: 400 }
      );
    }

    const dateToParsed = parseOptionalIsoDateParam(sp.get("date_to"));
    if (!dateToParsed.ok) {
      return NextResponse.json(
        { success: false, error: "Invalid date_to: must be a valid ISO date string" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase.rpc("get_agency_stats", {
      p_workspace_id: session.workspaceId,
      p_project_id: projectId,
      p_webinar_run_id: webinarRunId,
      p_date_from: dateFromParsed.value,
      p_date_to: dateToParsed.value,
    });

    if (error !== null) {
      console.error("GET /api/dashboard/agency RPC error:", error);
      return NextResponse.json(
        { success: false, error: "Failed to load agency stats" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: data ?? [],
    });
  } catch (err) {
    console.error("GET /api/dashboard/agency:", err);
    return NextResponse.json(
      { success: false, error: "Failed to load agency stats" },
      { status: 500 }
    );
  }
}
