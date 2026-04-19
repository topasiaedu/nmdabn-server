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
 * GET /api/dashboard/agency
 * All-runs agency line funnel: Leads / Showed / Show-up% / Buyers / Conv% per run column.
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

    const { data, error } = await supabase.rpc("get_agency_all_runs", {
      p_project_id: projectId,
      p_workspace_id: session.workspaceId,
    });

    if (error !== null) {
      console.error("GET /api/dashboard/agency RPC error:", error);
      return NextResponse.json(
        { success: false, error: "Failed to load agency data" },
        { status: 500 }
      );
    }

    const rows = (data ?? []) as Array<{
      run_id: string;
      run_start_at: string;
      agency_line: string;
      leads: number;
      showed: number;
      buyers: number;
      showup_rate: number | null;
      conv_rate: number | null;
    }>;

    const columns: RunColumn[] = buildRunColumns(rows);
    const runIndex = new Map<string, number>(
      columns.map((c, i) => [c.run_id, i])
    );

    /**
     * For each agency line, we build 5 rows:
     *   Leads, Showed, Show-up%, Buyers, Conv%
     */
    type LineAccum = {
      leads: (number | null)[];
      showed: (number | null)[];
      showup: (number | null)[];
      buyers: (number | null)[];
      conv: (number | null)[];
    };

    const lineMap = new Map<string, LineAccum>();

    const emptyLine = (): LineAccum => ({
      leads: new Array<number | null>(columns.length).fill(null),
      showed: new Array<number | null>(columns.length).fill(null),
      showup: new Array<number | null>(columns.length).fill(null),
      buyers: new Array<number | null>(columns.length).fill(null),
      conv: new Array<number | null>(columns.length).fill(null),
    });

    for (const row of rows) {
      if (!lineMap.has(row.agency_line)) {
        lineMap.set(row.agency_line, emptyLine());
      }
      const acc = lineMap.get(row.agency_line);
      if (acc === undefined) continue;

      const idx = runIndex.get(row.run_id);
      if (idx === undefined) continue;

      acc.leads[idx] = row.leads;
      acc.showed[idx] = row.showed;
      acc.showup[idx] = row.showup_rate;
      acc.buyers[idx] = row.buyers;
      acc.conv[idx] = row.conv_rate;
    }

    const sections: ColumnTableSection[] = [];

    for (const [line, acc] of lineMap) {
      const totalLeads = acc.leads.reduce<number>(
        (s, v) => s + (v ?? 0),
        0
      );
      const totalShowed = acc.showed.reduce<number>(
        (s, v) => s + (v ?? 0),
        0
      );
      const totalBuyers = acc.buyers.reduce<number>(
        (s, v) => s + (v ?? 0),
        0
      );

      sections.push({
        key: line,
        label: line,
        rows: [
          {
            label: "Leads",
            total: totalLeads,
            per_run: acc.leads,
            isSubRow: true,
          },
          {
            label: "Showed",
            total: totalShowed,
            per_run: acc.showed,
            isSubRow: true,
          },
          {
            label: "Show-up %",
            total:
              totalLeads > 0 ? totalShowed / totalLeads : null,
            per_run: acc.showup,
            isRate: true,
            isSubRow: true,
          },
          {
            label: "Buyers",
            total: totalBuyers,
            per_run: acc.buyers,
            isSubRow: true,
          },
          {
            label: "Conv %",
            total:
              totalLeads > 0 ? totalBuyers / totalLeads : null,
            per_run: acc.conv,
            isRate: true,
            isSubRow: true,
          },
        ],
      });
    }

    const payload: AllRunsPayload = { columns, sections };
    return NextResponse.json({ success: true, data: payload });
  } catch (err) {
    console.error("GET /api/dashboard/agency:", err);
    return NextResponse.json(
      { success: false, error: "Failed to load agency data" },
      { status: 500 }
    );
  }
}
