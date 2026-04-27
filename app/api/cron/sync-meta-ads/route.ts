/**
 * GET /api/cron/sync-meta-ads
 *
 * Vercel Cron job handler (scheduled hourly via vercel.json).  Performs a
 * short 3-day incremental sync for every project that has at least one linked
 * Meta ad account, then updates last_synced_at so the dashboard can detect
 * when data was last refreshed.
 *
 * Security: requests must carry `Authorization: Bearer <CRON_SECRET>`.
 * Vercel injects this header automatically when `CRON_SECRET` is set.
 */
import { type NextRequest, NextResponse } from "next/server";
import { supabase } from "@/config/supabase";
import { syncMetaAdsForProject } from "@/services/meta-ads-sync";

export const runtime = "nodejs";

/** Lookback window for the nightly cron sync (covers the past day + 1 buffer day). */
const CRON_LOOKBACK_DAYS = 2;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret === undefined || cronSecret.trim() === "") {
    console.error("[cron/sync-meta-ads] CRON_SECRET env var is not set");
    return NextResponse.json(
      { success: false, error: "CRON_SECRET not configured" },
      { status: 500 }
    );
  }

  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length).trim()
    : "";

  if (token !== cronSecret.trim()) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  // Gather distinct project IDs that have at least one linked Meta account.
  const { data: mappings, error: mappingError } = await supabase
    .from("project_meta_ad_accounts")
    .select("project_id");

  if (mappingError !== null) {
    console.error("[cron/sync-meta-ads] Failed to load project_meta_ad_accounts:", mappingError.message);
    return NextResponse.json(
      { success: false, error: "Failed to load projects" },
      { status: 500 }
    );
  }

  const projectIds = [...new Set((mappings ?? []).map((r) => r.project_id))];

  if (projectIds.length === 0) {
    return NextResponse.json({ success: true, projectsSynced: 0, results: [] });
  }

  type ProjectResult = {
    projectId: string;
    ok: boolean;
    error?: string;
    accountsProcessed?: number;
    insightRowsUpserted?: number;
  };

  const results: ProjectResult[] = [];

  for (const projectId of projectIds) {
    try {
      const result = await syncMetaAdsForProject(projectId, supabase, CRON_LOOKBACK_DAYS);
      results.push({
        projectId,
        ok: true,
        accountsProcessed: result.accountsProcessed,
        insightRowsUpserted:
          result.insightRowsUpserted +
          result.adsetInsightRowsUpserted +
          result.adInsightRowsUpserted,
      });
      console.log(
        `[cron/sync-meta-ads] project=${projectId} accounts=${result.accountsProcessed} insightRows=${result.insightRowsUpserted}`
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      console.error(`[cron/sync-meta-ads] project=${projectId} error:`, msg);
      results.push({ projectId, ok: false, error: msg });
    }
  }

  return NextResponse.json({
    success: true,
    projectsSynced: results.filter((r) => r.ok).length,
    results,
  });
}
