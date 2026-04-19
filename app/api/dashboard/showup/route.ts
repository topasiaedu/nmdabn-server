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
 * GET /api/dashboard/showup
 * All-runs show-up rate breakdown by configured breakdown fields.
 * Each section has rows: "Leads", "Showed", "Show-up %" (isRate).
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

    const { data, error } = await supabase.rpc("get_showup_all_runs", {
      p_project_id: projectId,
      p_workspace_id: session.workspaceId,
    });

    if (error !== null) {
      console.error("GET /api/dashboard/showup RPC error:", error);
      return NextResponse.json(
        { success: false, error: "Failed to load show-up data" },
        { status: 500 }
      );
    }

    const rows = (data ?? []) as Array<{
      run_id: string;
      run_start_at: string;
      section_key: string;
      section_label: string;
      row_label: string;
      attended: number;
      total: number;
    }>;

    const columns: RunColumn[] = buildRunColumns(rows);
    const runIndex = new Map<string, number>(
      columns.map((c, i) => [c.run_id, i])
    );

    /** section_key → row_label → { attended[], total[] } */
    type CellAccum = { attended: (number | null)[]; total: (number | null)[] };
    const sectionLabels = new Map<string, string>();
    const sectionData = new Map<string, Map<string, CellAccum>>();

    for (const row of rows) {
      sectionLabels.set(row.section_key, row.section_label);
      if (!sectionData.has(row.section_key)) {
        sectionData.set(row.section_key, new Map());
      }
      const rowMap = sectionData.get(row.section_key);
      if (rowMap === undefined) continue;

      if (!rowMap.has(row.row_label)) {
        rowMap.set(row.row_label, {
          attended: new Array<number | null>(columns.length).fill(null),
          total: new Array<number | null>(columns.length).fill(null),
        });
      }
      const cell = rowMap.get(row.row_label);
      if (cell === undefined) continue;

      const idx = runIndex.get(row.run_id);
      if (idx !== undefined) {
        cell.attended[idx] = (cell.attended[idx] ?? 0) + row.attended;
        cell.total[idx] = (cell.total[idx] ?? 0) + row.total;
      }
    }

    const sections: ColumnTableSection[] = [];
    for (const [sectionKey, rowMap] of sectionData) {
      const leadsRow = {
        label: "Leads",
        total: 0,
        per_run: new Array<number | null>(columns.length).fill(null),
        isSubRow: true,
      };
      const showedRow = {
        label: "Showed",
        total: 0,
        per_run: new Array<number | null>(columns.length).fill(null),
        isSubRow: true,
      };
      const rateRow = {
        label: "Show-up %",
        total: null as number | null,
        per_run: new Array<number | null>(columns.length).fill(null),
        isRate: true,
        isSubRow: true,
      };

      const subSections: ColumnTableSection["rows"] = [];

      for (const [rowLabel, cell] of rowMap) {
        const totalLeads = cell.total.reduce<number>(
          (acc, v) => acc + (v ?? 0),
          0
        );
        const totalAttended = cell.attended.reduce<number>(
          (acc, v) => acc + (v ?? 0),
          0
        );

        /** One sub-header row per breakdown value */
        subSections.push({
          label: rowLabel,
          total: totalLeads,
          per_run: cell.total,
        });
        subSections.push({
          label: "  Showed",
          total: totalAttended,
          per_run: cell.attended,
          isSubRow: true,
        });
        const ratePerRun = cell.total.map((t, i) => {
          const a = cell.attended[i] ?? 0;
          return t !== null && t > 0 ? a / t : null;
        });
        subSections.push({
          label: "  Show-up %",
          total:
            totalLeads > 0 ? totalAttended / totalLeads : null,
          per_run: ratePerRun,
          isRate: true,
          isSubRow: true,
        });

        /* Accumulate grand Leads/Showed/Rate rows */
        leadsRow.total += totalLeads;
        showedRow.total += totalAttended;
        for (let i = 0; i < columns.length; i++) {
          leadsRow.per_run[i] =
            (leadsRow.per_run[i] ?? 0) + (cell.total[i] ?? 0);
          showedRow.per_run[i] =
            (showedRow.per_run[i] ?? 0) + (cell.attended[i] ?? 0);
        }
      }

      /* Overall rate row */
      for (let i = 0; i < columns.length; i++) {
        const l = leadsRow.per_run[i] ?? 0;
        const s = showedRow.per_run[i] ?? 0;
        rateRow.per_run[i] = l > 0 ? s / l : null;
      }
      rateRow.total =
        leadsRow.total > 0 ? showedRow.total / leadsRow.total : null;

      sections.push({
        key: sectionKey,
        label: sectionLabels.get(sectionKey) ?? sectionKey,
        rows: [...subSections, leadsRow, showedRow, rateRow],
      });
    }

    const payload: AllRunsPayload = { columns, sections };
    return NextResponse.json({ success: true, data: payload });
  } catch (err) {
    console.error("GET /api/dashboard/showup:", err);
    return NextResponse.json(
      { success: false, error: "Failed to load show-up data" },
      { status: 500 }
    );
  }
}
