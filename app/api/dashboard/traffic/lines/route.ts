import { type NextRequest, NextResponse } from "next/server";
import { env } from "@/config/env";
import { listConfiguredLineKeys } from "@/config/traffic";
import { nextResponseFromGuard } from "@/lib/guard-response";
import { resolveTrafficDashboardAuth } from "@/middleware/traffic-dashboard-flex-auth";
import { supabase } from "@/config/supabase";
import { resolveAgencyLineTagsForRequest } from "@/services/traffic-project-settings";

/**
 * GET /api/dashboard/traffic/lines — list configured line keys (and tags when project-scoped).
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const flex = await resolveTrafficDashboardAuth(request);
  if (!flex.ok) {
    return nextResponseFromGuard(flex);
  }

  try {
    if (flex.mode === "legacy") {
      return NextResponse.json({
        success: true,
        lines: listConfiguredLineKeys(env.trafficAgencyLineTags),
        tagsByLine: env.trafficAgencyLineTags,
        auth: "legacy",
      });
    }

    const workspaceId = flex.workspaceId;
    if (workspaceId.trim() === "") {
      return NextResponse.json(
        { success: false, error: "workspace_id query parameter is required" },
        { status: 400 }
      );
    }

    const projectId =
      request.nextUrl.searchParams.get("project_id")?.trim() ?? "";

    if (projectId === "") {
      return NextResponse.json({
        success: true,
        lines: listConfiguredLineKeys(env.trafficAgencyLineTags),
        tagsByLine: env.trafficAgencyLineTags,
        auth: "user",
        tagSource: "env_default",
      });
    }

    const { data: proj, error } = await supabase
      .from("projects")
      .select("traffic_agency_line_tags")
      .eq("id", projectId)
      .eq("workspace_id", workspaceId)
      .maybeSingle();

    if (error !== null) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }
    if (proj === null) {
      return NextResponse.json(
        { success: false, error: "Project not found" },
        { status: 404 }
      );
    }

    const tags = resolveAgencyLineTagsForRequest(
      proj.traffic_agency_line_tags,
      env.trafficAgencyLineTags
    );

    return NextResponse.json({
      success: true,
      lines: listConfiguredLineKeys(tags),
      tagsByLine: tags,
      auth: "user",
      tagSource:
        proj.traffic_agency_line_tags === null ? "env_default" : "project",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
