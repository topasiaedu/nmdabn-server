import { type NextRequest, NextResponse } from "next/server";
import { supabase } from "@/config/supabase";
import { nextResponseFromGuard } from "@/lib/guard-response";
import { requireAuthAndWorkspace } from "@/middleware/workspace";
import {
  buildRunColumns,
  type AllRunsPayload,
  type ColumnTableSection,
  type RunColumn,
} from "@/lib/all-runs-pivot";

export const runtime = "nodejs";

/**
 * GET /api/dashboard/buyer-behavior
 * All-runs buyer behavior breakdown: DYD / occupation fields / program / purchase totals.
 *
 * Query params:
 *   workspace_id – required (or X-Workspace-Id header)
 *   project_id   – required
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const session = await requireAuthAndWorkspace(request);
  if (!session.ok) {
    return nextResponseFromGuard(session);
  }

  try {
    const sp = request.nextUrl.searchParams;
    const projectId = sp.get("project_id")?.trim() ?? "";
    if (projectId === "") {
      return NextResponse.json(
        { success: false, error: "project_id query parameter is required" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase.rpc("get_buyer_behavior_all_runs", {
      p_project_id: projectId,
      p_workspace_id: session.workspaceId,
    });

    if (error !== null) {
      console.error("GET /api/dashboard/buyer-behavior RPC error:", error);
      return NextResponse.json(
        { success: false, error: "Failed to load buyer behavior data" },
        { status: 500 }
      );
    }

    const rows = (data ?? []) as Array<{
      run_id: string;
      run_start_at: string;
      section: string;
      label: string;
      count: number;
      pct: number | null;
    }>;

    const columns: RunColumn[] = buildRunColumns(rows);
    const runIndex = new Map<string, number>(
      columns.map((c, i) => [c.run_id, i])
    );

    /** section → label → per_run counts */
    const sectionData = new Map<string, Map<string, (number | null)[]>>();

    for (const row of rows) {
      if (!sectionData.has(row.section)) {
        sectionData.set(row.section, new Map());
      }
      const rowMap = sectionData.get(row.section);
      if (rowMap === undefined) continue;

      if (!rowMap.has(row.label)) {
        rowMap.set(
          row.label,
          new Array<number | null>(columns.length).fill(null)
        );
      }
      const perRun = rowMap.get(row.label);
      if (perRun === undefined) continue;

      const idx = runIndex.get(row.run_id);
      if (idx !== undefined) {
        perRun[idx] = (perRun[idx] ?? 0) + row.count;
      }
    }

    /** Display name mapping for well-known section keys. */
    const SECTION_LABELS: Record<string, string> = {
      dyd: "DYD (Deal Your Deal)",
      dyd_closing: "DYD Closing",
      program: "Program (UTM Campaign)",
      purchase: "Purchase Summary",
    };

    const SECTION_ORDER = ["dyd", "dyd_closing", "program", "purchase"];

    const sections: ColumnTableSection[] = [];
    const orderedKeys = [
      ...SECTION_ORDER.filter((k) => sectionData.has(k)),
      ...[...sectionData.keys()].filter((k) => !SECTION_ORDER.includes(k)),
    ];

    for (const sectionKey of orderedKeys) {
      const rowMap = sectionData.get(sectionKey);
      if (rowMap === undefined) continue;

      const tableRows = [...rowMap.entries()].map(([label, perRun]) => {
        const total = perRun.reduce<number>((acc, v) => acc + (v ?? 0), 0);
        return { label, total, per_run: perRun };
      });

      sections.push({
        key: sectionKey,
        label: SECTION_LABELS[sectionKey] ?? sectionKey,
        rows: tableRows,
      });
    }

    const payload: AllRunsPayload = { columns, sections };
    return NextResponse.json({ success: true, data: payload });
  } catch (err) {
    console.error("GET /api/dashboard/buyer-behavior:", err);
    return NextResponse.json(
      { success: false, error: "Failed to load buyer behavior data" },
      { status: 500 }
    );
  }
}
