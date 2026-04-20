import { type NextRequest, NextResponse } from "next/server";
import { supabase } from "@/config/supabase";
import { nextResponseFromGuard } from "@/lib/guard-response";
import { requireAuthAndWorkspace } from "@/middleware/workspace";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/projects/:id/connections/meta
 * Lists linked Meta ad accounts for a project (safe, non-secret columns only).
 */
export async function GET(
  request: NextRequest,
  context: RouteContext
): Promise<NextResponse> {
  const session = await requireAuthAndWorkspace(request);
  if (!session.ok) {
    return nextResponseFromGuard(session);
  }

  const { id: projectId } = await context.params;

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .eq("workspace_id", session.workspaceId)
    .single();

  if (projectError !== null || project === null) {
    return NextResponse.json(
      { success: false, error: "Project not found" },
      { status: 404 }
    );
  }

  try {
    const { data, error } = await supabase
      .from("project_meta_ad_accounts")
      .select(
        "id, agency_line, created_at, integration_account_id, integration_accounts(display_name, account_id, expires_at, extra)"
      )
      .eq("project_id", projectId)
      .order("created_at", { ascending: false });

    if (error !== null) {
      console.error("GET /api/projects/[id]/connections/meta:", error);
      return NextResponse.json(
        { success: false, error: "Failed to list Meta connections" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, data: data ?? [] });
  } catch (e) {
    console.error("GET /api/projects/[id]/connections/meta unexpected:", e);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
