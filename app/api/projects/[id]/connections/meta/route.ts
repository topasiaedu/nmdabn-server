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

/**
 * DELETE /api/projects/:id/connections/meta
 * Removes a single project_meta_ad_accounts row by `connection_id` query param.
 * Also removes the integration_accounts row if no other projects reference it.
 */
export async function DELETE(
  request: NextRequest,
  context: RouteContext
): Promise<NextResponse> {
  const session = await requireAuthAndWorkspace(request);
  if (!session.ok) {
    return nextResponseFromGuard(session);
  }

  const { id: projectId } = await context.params;
  const connectionId = request.nextUrl.searchParams.get("connection_id")?.trim() ?? "";

  if (connectionId === "") {
    return NextResponse.json(
      { success: false, error: "connection_id query parameter is required" },
      { status: 400 }
    );
  }

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
    /** Fetch the link row to get the integration_account_id before deleting it. */
    const { data: linkRow, error: fetchError } = await supabase
      .from("project_meta_ad_accounts")
      .select("id, integration_account_id")
      .eq("id", connectionId)
      .eq("project_id", projectId)
      .maybeSingle();

    if (fetchError !== null) {
      console.error("DELETE meta connection: fetch error", fetchError);
      return NextResponse.json(
        { success: false, error: "Failed to find connection" },
        { status: 500 }
      );
    }

    if (linkRow === null) {
      return NextResponse.json(
        { success: false, error: "Connection not found on this project" },
        { status: 404 }
      );
    }

    const { error: deleteError } = await supabase
      .from("project_meta_ad_accounts")
      .delete()
      .eq("id", connectionId);

    if (deleteError !== null) {
      console.error("DELETE meta connection: delete error", deleteError);
      return NextResponse.json(
        { success: false, error: "Failed to remove connection" },
        { status: 500 }
      );
    }

    /** Clean up the integration_accounts row if no other project links reference it. */
    const { count } = await supabase
      .from("project_meta_ad_accounts")
      .select("id", { count: "exact", head: true })
      .eq("integration_account_id", linkRow.integration_account_id);

    if (count === 0) {
      await supabase
        .from("integration_accounts")
        .delete()
        .eq("id", linkRow.integration_account_id);
    }

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("DELETE /api/projects/[id]/connections/meta unexpected:", e);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
