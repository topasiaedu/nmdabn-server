import { type NextRequest, NextResponse } from "next/server";
import { supabase } from "@/config/supabase";
import { nextResponseFromGuard } from "@/lib/guard-response";
import { requireAuthAndWorkspace } from "@/middleware/workspace";
import {
  buildRunColumns,
  pivotCountRows,
  type AllRunsPayload,
} from "@/lib/all-runs-pivot";
import { fetchProjectTrafficSettings } from "@/services/traffic-project-settings";
import { env } from "@/config/env";
import { getTagsForLine } from "@/config/traffic";

export const runtime = "nodejs";

/** Canonical order for UTM axes passed to `get_traffic_all_runs`. */
const UTM_AXIS_ORDER = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
] as const;

type UtmAxis = (typeof UTM_AXIS_ORDER)[number];

function isUtmAxis(value: string): value is UtmAxis {
  return (UTM_AXIS_ORDER as readonly string[]).includes(value);
}

/**
 * Parse `dimensions=utm_source,utm_campaign` into ordered unique axes.
 * Invalid tokens are dropped. Empty result defaults to utm_content only.
 */
function parseUtmDimensionsParam(raw: string | null): UtmAxis[] {
  if (raw === null || raw.trim() === "") {
    return ["utm_content"];
  }
  const requested = new Set<UtmAxis>();
  for (const part of raw.split(",")) {
    const t = part.trim().toLowerCase();
    if (isUtmAxis(t)) {
      requested.add(t);
    }
  }
  const ordered = UTM_AXIS_ORDER.filter((a) => requested.has(a));
  return ordered.length > 0 ? ordered : ["utm_content"];
}

/**
 * GET /api/dashboard/traffic
 * All-runs traffic: last-touch UTM combination rows (distinct contacts per run).
 *
 * Query params:
 *   workspace_id  – required (or X-Workspace-Id header)
 *   project_id    – required
 *   line          – optional agency line key (e.g. "NM", "OM"). Omit or "All" for all contacts.
 *   dimensions    – optional comma list: utm_source, utm_medium, utm_campaign, utm_content.
 *                   Row labels join selected values with " | ". Default: utm_content only.
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

    const lineKey = sp.get("line")?.trim() ?? "All";
    const utmAxes = parseUtmDimensionsParam(sp.get("dimensions"));

    /* Resolve line tags for filtering (null = all contacts). */
    let lineTags: string[] | undefined = undefined;
    if (lineKey !== "" && lineKey !== "All") {
      const resolved = await fetchProjectTrafficSettings(
        projectId,
        session.workspaceId,
        env.trafficAgencyLineTags
      );
      if ("error" in resolved) {
        return NextResponse.json(
          { success: false, error: resolved.error },
          { status: 400 }
        );
      }
      const tags = getTagsForLine(lineKey, resolved.agencyLineTags);
      if (tags === undefined || tags.length === 0) {
        return NextResponse.json(
          {
            success: false,
            error: `Unknown line "${lineKey}". Configured lines: ${Object.keys(
              resolved.agencyLineTags ?? {}
            ).join(", ")}`,
          },
          { status: 400 }
        );
      }
      lineTags = tags;
    }

    const { data, error } = await supabase.rpc("get_traffic_all_runs", {
      p_project_id: projectId,
      p_workspace_id: session.workspaceId,
      p_line_tags: lineTags,
      p_utm_axes: utmAxes,
    });

    if (error !== null) {
      console.error("GET /api/dashboard/traffic RPC error:", error);
      return NextResponse.json(
        { success: false, error: "Failed to load traffic data" },
        { status: 500 }
      );
    }

    const rows = (data ?? []) as Array<{
      run_id: string;
      run_start_at: string;
      section_key: string;
      section_label: string;
      row_label: string;
      lead_count: number;
    }>;

    const columns = buildRunColumns(rows);
    const sections = pivotCountRows(rows, columns);

    const payload: AllRunsPayload = { columns, sections };

    return NextResponse.json({ success: true, data: payload });
  } catch (err) {
    console.error("GET /api/dashboard/traffic:", err);
    return NextResponse.json(
      { success: false, error: "Failed to load traffic data" },
      { status: 500 }
    );
  }
}
