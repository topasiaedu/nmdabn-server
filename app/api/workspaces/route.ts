import { type NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/middleware/auth";
import { nextResponseFromGuard } from "@/lib/guard-response";
import { supabase } from "@/config/supabase";

/**
 * GET /api/workspaces — list workspaces the current user can access.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await authenticateRequest(request);
  if (!auth.ok) {
    return nextResponseFromGuard(auth);
  }

  try {
    const { data: memberships, error } = await supabase
      .from("workspace_members")
      .select("role, workspaces(id, name)")
      .eq("user_id", auth.userId);

    if (error) {
      return NextResponse.json(
        {
          success: false,
          error: `Failed to fetch workspaces: ${error.message}`,
        },
        { status: 500 }
      );
    }

    const rows = (memberships ?? [])
      .map((m) => {
        const ws = m.workspaces;
        if (ws === null || Array.isArray(ws)) {
          return null;
        }
        return {
          id: ws.id,
          name: ws.name,
          role: m.role,
        };
      })
      .filter(
        (v): v is { id: string; name: string; role: string } => v !== null
      );

    return NextResponse.json({ success: true, data: rows });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
