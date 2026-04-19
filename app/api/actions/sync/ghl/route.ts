import { type NextRequest, NextResponse } from "next/server";
import { env } from "@/config/env";
import { supabase } from "@/config/supabase";
import { nextResponseFromGuard } from "@/lib/guard-response";
import { parseJsonObjectBody } from "@/lib/parse-json-body";
import { requireAuthAndWorkspace } from "@/middleware/workspace";
import {
  runGhlFullContactSyncForConnectionId,
  runGhlFullOrdersInvoicesSyncForConnectionId,
} from "@/services/ghl-webhook-sync";

export const runtime = "nodejs";

/**
 * POST /api/actions/sync/ghl — full GHL contacts + orders/invoices sync for every active
 * `ghl_connections` row under projects in the workspace.
 * Body: { workspace_id: string }
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

  const { data: projects, error: projectsError } = await supabase
    .from("projects")
    .select("id")
    .eq("workspace_id", session.workspaceId);

  if (projectsError !== null) {
    console.error("projects list for GHL sync:", projectsError.message);
    return NextResponse.json(
      { success: false, error: "Failed to load projects" },
      { status: 500 }
    );
  }

  const projectIds = projects.map((p) => p.id);
  if (projectIds.length === 0) {
    return NextResponse.json({ success: true, triggered: 0 });
  }

  const { data: connections, error: connectionsError } = await supabase
    .from("ghl_connections")
    .select("id, ghl_location_id")
    .in("project_id", projectIds)
    .eq("is_active", true);

  if (connectionsError !== null) {
    console.error("ghl_connections list for GHL sync:", connectionsError.message);
    return NextResponse.json(
      { success: false, error: "Failed to load GHL connections" },
      { status: 500 }
    );
  }

  const connectionRows = connections ?? [];
  let triggered = 0;

  for (const row of connectionRows) {
    try {
      await runGhlFullContactSyncForConnectionId(row.id);
      await runGhlFullOrdersInvoicesSyncForConnectionId(row.id);

      /* After syncing contacts, backfill webinar_run_id for all contacts
       * in this location. This assigns each contact to their next upcoming
       * webinar run based on their opt-in date. */
      const { error: backfillError } = await supabase.rpc(
        "backfill_webinar_runs_for_location",
        { p_location_id: row.ghl_location_id }
      );
      if (backfillError !== null) {
        console.warn(
          `backfill_webinar_runs_for_location failed for location ${row.ghl_location_id}:`,
          backfillError.message
        );
      }

      triggered += 1;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "GHL full sync failed";
      console.error(`GHL full sync failed for connection ${row.id}:`, msg);
      return NextResponse.json(
        { success: false, error: "GHL full sync failed" },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({ success: true, triggered });
}
