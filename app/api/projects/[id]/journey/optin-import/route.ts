import { type NextRequest, NextResponse } from "next/server";
import { env } from "@/config/env";
import { supabase } from "@/config/supabase";
import { nextResponseFromGuard } from "@/lib/guard-response";
import { parseLeadTrackingCsv } from "@/lib/parse-csv";
import { parseJsonObjectBody } from "@/lib/parse-json-body";
import { requireAuthAndWorkspace } from "@/middleware/workspace";
import { loadGhlCredentialsForProject } from "@/services/ghl-project-credentials";
import {
  importOptinRowsFromSheet,
  type OptinImportProgress,
  type OptinImportResult,
} from "@/services/optin-journey-import";
import { resolveAgencyLineTagsForRequest } from "@/services/traffic-project-settings";

export const runtime = "nodejs";

type NdjsonEvent =
  | ({ type: "progress" } & OptinImportProgress)
  | { type: "complete"; result: OptinImportResult }
  | { type: "error"; message: string };

function ndjsonEncode(ev: NdjsonEvent): Uint8Array {
  return new TextEncoder().encode(`${JSON.stringify(ev)}\n`);
}

const MAX_CSV_CHARS = 12_000_000;
const MAX_ROWS = 8000;

type RouteContext = { params: Promise<{ id: string }> };

/**
 * POST /api/projects/:id/journey/optin-import
 * Body JSON: { workspace_id, agency_line, csv_text, stream?: boolean }
 * When `stream` is true, response is NDJSON: `progress` lines then `complete` or `error`.
 * Imports CAE-style webinar lead CSV: GHL find/create, agency tags, mirror sync, journey_events optin.
 */
export async function POST(
  request: NextRequest,
  context: RouteContext
): Promise<NextResponse> {
  const parsedBody = await parseJsonObjectBody(request);
  if (!parsedBody.ok) {
    return NextResponse.json(
      { success: false, error: parsedBody.error },
      { status: parsedBody.status }
    );
  }

  const session = await requireAuthAndWorkspace(request, parsedBody.body);
  if (!session.ok) {
    return nextResponseFromGuard(session);
  }

  const { id: projectId } = await context.params;

  const agencyRaw = parsedBody.body["agency_line"];
  const csvRaw = parsedBody.body["csv_text"];

  if (typeof agencyRaw !== "string" || agencyRaw.trim() === "") {
    return NextResponse.json(
      { success: false, error: "agency_line is required" },
      { status: 400 }
    );
  }
  if (typeof csvRaw !== "string") {
    return NextResponse.json(
      { success: false, error: "csv_text must be a string" },
      { status: 400 }
    );
  }

  const agencyLine = agencyRaw.trim();
  if (csvRaw.length > MAX_CSV_CHARS) {
    return NextResponse.json(
      {
        success: false,
        error: `csv_text exceeds maximum length (${MAX_CSV_CHARS} characters)`,
      },
      { status: 400 }
    );
  }

  const { rows: parsedRows, error: parseErr } = parseLeadTrackingCsv(csvRaw);
  if (parseErr !== null) {
    return NextResponse.json({ success: false, error: parseErr }, { status: 400 });
  }
  if (parsedRows.length === 0) {
    return NextResponse.json(
      { success: false, error: "No data rows with a non-empty email were found" },
      { status: 400 }
    );
  }
  if (parsedRows.length > MAX_ROWS) {
    return NextResponse.json(
      {
        success: false,
        error: `Too many rows (${parsedRows.length}); maximum is ${MAX_ROWS}`,
      },
      { status: 400 }
    );
  }

  try {
    const { data: project, error: projErr } = await supabase
      .from("projects")
      .select("id, workspace_id, ghl_location_id, traffic_agency_line_tags")
      .eq("id", projectId)
      .eq("workspace_id", session.workspaceId)
      .maybeSingle();

    if (projErr !== null || project === null) {
      return NextResponse.json(
        { success: false, error: "Project not found" },
        { status: 404 }
      );
    }

    const locationId =
      typeof project.ghl_location_id === "string"
        ? project.ghl_location_id.trim()
        : "";
    if (locationId === "") {
      return NextResponse.json(
        {
          success: false,
          error: "Project has no ghl_location_id; configure GHL for this project first",
        },
        { status: 400 }
      );
    }

    const agencyLineTags = resolveAgencyLineTagsForRequest(
      project.traffic_agency_line_tags,
      env.trafficAgencyLineTags
    );
    if (agencyLineTags[agencyLine] === undefined) {
      return NextResponse.json(
        {
          success: false,
          error: `Unknown agency_line "${agencyLine}". Configured keys: ${Object.keys(agencyLineTags).join(", ")}`,
        },
        { status: 400 }
      );
    }

    const creds = await loadGhlCredentialsForProject(supabase, projectId);
    if ("error" in creds) {
      return NextResponse.json(
        { success: false, error: creds.error },
        { status: 400 }
      );
    }

    const wantStream = parsedBody.body["stream"] === true;

    if (wantStream) {
      const stream = new ReadableStream<Uint8Array>({
        async start(controller) {
          try {
            const result = await importOptinRowsFromSheet({
              supabase,
              projectId: project.id,
              locationId,
              agencyLine,
              agencyLineTags,
              creds,
              rows: parsedRows,
              rowNumberOffset: 0,
              onProgress: (p: OptinImportProgress) => {
                controller.enqueue(
                  ndjsonEncode({
                    type: "progress",
                    ...p,
                  })
                );
              },
            });
            controller.enqueue(ndjsonEncode({ type: "complete", result }));
          } catch (err) {
            const msg = err instanceof Error ? err.message : "Import failed";
            console.error("optin-import stream:", err);
            controller.enqueue(
              ndjsonEncode({ type: "error", message: msg })
            );
          } finally {
            controller.close();
          }
        },
      });

      return new NextResponse(stream, {
        status: 200,
        headers: {
          "Content-Type": "application/x-ndjson; charset=utf-8",
          "Cache-Control": "no-store",
          "X-Accel-Buffering": "no",
        },
      });
    }

    const result = await importOptinRowsFromSheet({
      supabase,
      projectId: project.id,
      locationId,
      agencyLine,
      agencyLineTags,
      creds,
      rows: parsedRows,
      rowNumberOffset: 0,
    });

    return NextResponse.json({ success: true, data: result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Import failed";
    console.error("optin-import:", e);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
