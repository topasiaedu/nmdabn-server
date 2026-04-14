import { type NextRequest, NextResponse } from "next/server";
import { nextResponseFromGuard } from "@/lib/guard-response";
import { INTEGRATION_ACCOUNT_SAFE_RESPONSE_COLUMNS } from "@/lib/integration-accounts-api";
import { requireAuthAndWorkspace } from "@/middleware/workspace";
import { supabase } from "@/config/supabase";

/**
 * GET /api/integrations/accounts — list integration accounts for a workspace.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const session = await requireAuthAndWorkspace(request);
  if (!session.ok) {
    return nextResponseFromGuard(session);
  }

  try {
    const provider = request.nextUrl.searchParams.get("provider") ?? undefined;

    let query = supabase
      .from("integration_accounts")
      .select(INTEGRATION_ACCOUNT_SAFE_RESPONSE_COLUMNS)
      .eq("workspace_id", session.workspaceId)
      .order("created_at", { ascending: false });

    if (
      provider === "zoom" ||
      provider === "vapi" ||
      provider === "google_sheets" ||
      provider === "gohighlevel"
    ) {
      query = query.eq("provider", provider);
    }

    const { data, error } = await query;

    if (error) {
      console.error("Error fetching integration accounts:", error);
      return NextResponse.json(
        { success: false, error: "Failed to fetch integration accounts" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, data });
  } catch (e) {
    console.error("Unexpected error:", e);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
