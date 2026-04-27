/**
 * GET /api/dashboard/ads-manager/sync-status
 *
 * Returns the earliest `last_synced_at` timestamp across all Meta ad accounts
 * linked to the project.  The dashboard uses this value to decide whether to
 * trigger an on-load incremental sync (stale > 30 minutes) without blocking
 * the initial render.
 *
 * Query params:
 *   workspace_id – required (standard workspace auth)
 *   project_id   – required
 *
 * Response:
 *   { success: true, last_synced_at: string | null }
 */
import { type NextRequest, NextResponse } from "next/server";
import { supabase } from "@/config/supabase";
import { nextResponseFromGuard } from "@/lib/guard-response";
import { requireAuthAndWorkspace } from "@/middleware/workspace";

export const runtime = "nodejs";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const session = await requireAuthAndWorkspace(request);
  if (!session.ok) {
    return nextResponseFromGuard(session);
  }

  const sp = request.nextUrl.searchParams;
  const projectId = sp.get("project_id")?.trim() ?? "";

  if (projectId === "") {
    return NextResponse.json(
      { success: false, error: "project_id query parameter is required" },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from("project_meta_ad_accounts")
    .select("last_synced_at")
    .eq("project_id", projectId);

  if (error !== null) {
    console.error("GET /api/dashboard/ads-manager/sync-status:", error.message);
    return NextResponse.json(
      { success: false, error: "Failed to load sync status" },
      { status: 500 }
    );
  }

  const rows = data ?? [];

  if (rows.length === 0) {
    return NextResponse.json({ success: true, last_synced_at: null });
  }

  // Return MIN(last_synced_at): the oldest sync is the most relevant stale
  // signal — if any account hasn't synced yet, we treat the whole project as
  // needing a sync.
  let minSyncedAt: string | null = null;
  for (const row of rows) {
    const ts = row.last_synced_at;
    if (ts === null) {
      // Any null means at least one account has never synced.
      minSyncedAt = null;
      break;
    }
    if (minSyncedAt === null || ts < minSyncedAt) {
      minSyncedAt = ts;
    }
  }

  return NextResponse.json({ success: true, last_synced_at: minSyncedAt });
}
