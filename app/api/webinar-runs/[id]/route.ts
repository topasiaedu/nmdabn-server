import { type NextRequest, NextResponse } from "next/server";

import { supabase } from "@/config/supabase";

import type { Database } from "@/database.types";

import { nextResponseFromGuard } from "@/lib/guard-response";

import { parseJsonObjectBody } from "@/lib/parse-json-body";

import { requireAuthAndWorkspace } from "@/middleware/workspace";



export const runtime = "nodejs";



type WebinarRunRow = Database["public"]["Tables"]["webinar_runs"]["Row"];

type WebinarRunUpdate = Database["public"]["Tables"]["webinar_runs"]["Update"];



const UUID_RE =

  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;



function isUuidString(value: string): boolean {

  return UUID_RE.test(value);

}



function parseIsoTimestamp(raw: string): string | null {

  const trimmed = raw.trim();

  if (trimmed === "") {

    return null;

  }

  const ms = Date.parse(trimmed);

  if (Number.isNaN(ms)) {

    return null;

  }

  return new Date(ms).toISOString();

}



type RouteContext = { params: Promise<{ id: string }> };



/**

 * Loads the webinar run and ensures its project belongs to the workspace. Returns 404 if not.

 */

async function requireWebinarRunInWorkspace(

  runId: string,

  workspaceId: string

): Promise<{ ok: true; run: WebinarRunRow } | { ok: false; response: NextResponse }> {

  const { data: run, error } = await supabase

    .from("webinar_runs")

    .select("*")

    .eq("id", runId)

    .single();



  if (error !== null || run === null) {

    return {

      ok: false,

      response: NextResponse.json(

        { success: false, error: "Webinar run not found" },

        { status: 404 }

      ),

    };

  }



  if (run.project_id === null) {

    return {

      ok: false,

      response: NextResponse.json(

        { success: false, error: "Webinar run not found" },

        { status: 404 }

      ),

    };

  }



  const { data: project, error: projectError } = await supabase

    .from("projects")

    .select("id")

    .eq("id", run.project_id)

    .eq("workspace_id", workspaceId)

    .single();



  if (projectError !== null || project === null) {

    return {

      ok: false,

      response: NextResponse.json(

        { success: false, error: "Webinar run not found" },

        { status: 404 }

      ),

    };

  }



  return { ok: true, run };

}



/**

 * GET /api/webinar-runs/:id

 */

export async function GET(

  request: NextRequest,

  context: RouteContext

): Promise<NextResponse> {

  const session = await requireAuthAndWorkspace(request);

  if (!session.ok) {

    return nextResponseFromGuard(session);

  }



  const { id } = await context.params;



  const gate = await requireWebinarRunInWorkspace(id, session.workspaceId);

  if (!gate.ok) {

    return gate.response;

  }



  return NextResponse.json({ success: true, data: gate.run });

}



/**

 * PATCH /api/webinar-runs/:id

 */

export async function PATCH(

  request: NextRequest,

  context: RouteContext

): Promise<NextResponse> {

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



  const { id } = await context.params;



  const gate = await requireWebinarRunInWorkspace(id, session.workspaceId);

  if (!gate.ok) {

    return gate.response;

  }



  const body = parsed.body;

  const updateData: WebinarRunUpdate = {};



  if (body.project_id !== undefined) {

    if (typeof body.project_id !== "string" || !isUuidString(body.project_id)) {

      return NextResponse.json(

        { success: false, error: "project_id must be a valid UUID string" },

        { status: 400 }

      );

    }

    const { data: projectRow, error: projectError } = await supabase

      .from("projects")

      .select("id")

      .eq("id", body.project_id)

      .eq("workspace_id", session.workspaceId)

      .single();

    if (projectError !== null || projectRow === null) {

      return NextResponse.json(

        { success: false, error: "Project not found" },

        { status: 404 }

      );

    }

    updateData.project_id = body.project_id;

  }



  if (body.display_label !== undefined) {

    if (typeof body.display_label !== "string" || body.display_label.trim() === "") {

      return NextResponse.json(

        { success: false, error: "display_label must be a non-empty string" },

        { status: 400 }

      );

    }

    updateData.display_label = body.display_label.trim();

  }



  if (body.event_start_at !== undefined) {

    if (typeof body.event_start_at !== "string") {

      return NextResponse.json(

        { success: false, error: "event_start_at must be a string" },

        { status: 400 }

      );

    }

    const parsedStart = parseIsoTimestamp(body.event_start_at);

    if (parsedStart === null) {

      return NextResponse.json(

        { success: false, error: "event_start_at must be a valid ISO timestamp string" },

        { status: 400 }

      );

    }

    updateData.event_start_at = parsedStart;

  }



  if (body.event_end_at !== undefined) {

    if (typeof body.event_end_at !== "string") {

      return NextResponse.json(

        { success: false, error: "event_end_at must be a string" },

        { status: 400 }

      );

    }

    const parsedEnd = parseIsoTimestamp(body.event_end_at);

    if (parsedEnd === null) {

      return NextResponse.json(

        { success: false, error: "event_end_at must be a valid ISO timestamp string" },

        { status: 400 }

      );

    }

    updateData.event_end_at = parsedEnd;

  }



  if (body.format !== undefined) {

    if (typeof body.format !== "string" || body.format.trim() === "") {

      return NextResponse.json(

        { success: false, error: "format must be a non-empty string" },

        { status: 400 }

      );

    }

    updateData.format = body.format.trim();

  }



  if (body.location_id !== undefined) {

    if (typeof body.location_id !== "string" || body.location_id.trim() === "") {

      return NextResponse.json(

        { success: false, error: "location_id must be a non-empty string" },

        { status: 400 }

      );

    }

    updateData.location_id = body.location_id.trim();

  }



  if (body.timezone !== undefined) {

    if (typeof body.timezone !== "string" || body.timezone.trim() === "") {

      return NextResponse.json(

        { success: false, error: "timezone must be a non-empty string" },

        { status: 400 }

      );

    }

    updateData.timezone = body.timezone.trim();

  }



  if (body.zoom_meeting_id !== undefined) {

    if (body.zoom_meeting_id === null) {

      updateData.zoom_meeting_id = null;

    } else if (typeof body.zoom_meeting_id === "string") {

      updateData.zoom_meeting_id =

        body.zoom_meeting_id === "" ? null : body.zoom_meeting_id;

    } else {

      return NextResponse.json(

        { success: false, error: "zoom_meeting_id must be a string or null" },

        { status: 400 }

      );

    }

  }



  if (body.zoom_source_type !== undefined) {

    if (body.zoom_source_type === null) {

      updateData.zoom_source_type = null;

    } else if (

      body.zoom_source_type === "meeting" ||

      body.zoom_source_type === "webinar"

    ) {

      updateData.zoom_source_type = body.zoom_source_type;

    } else {

      return NextResponse.json(

        {

          success: false,

          error: 'zoom_source_type must be "meeting", "webinar", or null',

        },

        { status: 400 }

      );

    }

  }



  if (body.is_active !== undefined) {

    if (typeof body.is_active !== "boolean") {

      return NextResponse.json(

        { success: false, error: "is_active must be a boolean" },

        { status: 400 }

      );

    }

    updateData.is_active = body.is_active;

  }



  if (body.sort_order !== undefined) {

    if (body.sort_order === null) {

      updateData.sort_order = null;

    } else if (

      typeof body.sort_order === "number" &&

      Number.isInteger(body.sort_order)

    ) {

      updateData.sort_order = body.sort_order;

    } else {

      return NextResponse.json(

        { success: false, error: "sort_order must be an integer or null" },

        { status: 400 }

      );

    }

  }



  if (Object.keys(updateData).length === 0) {

    return NextResponse.json(

      { success: false, error: "No fields to update" },

      { status: 400 }

    );

  }



  try {

    const { data, error } = await supabase

      .from("webinar_runs")

      .update(updateData)

      .eq("id", id)

      .select("*")

      .single();



    if (error) {

      console.error("Error updating webinar run:", error);

      return NextResponse.json(

        { success: false, error: "Failed to update webinar run" },

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



/**

 * DELETE /api/webinar-runs/:id

 */

export async function DELETE(

  request: NextRequest,

  context: RouteContext

): Promise<NextResponse> {

  const session = await requireAuthAndWorkspace(request);

  if (!session.ok) {

    return nextResponseFromGuard(session);

  }



  const { id } = await context.params;



  const gate = await requireWebinarRunInWorkspace(id, session.workspaceId);

  if (!gate.ok) {

    return gate.response;

  }



  try {

    const { error } = await supabase.from("webinar_runs").delete().eq("id", id);



    if (error) {

      console.error("Error deleting webinar run:", error);

      return NextResponse.json(

        { success: false, error: "Failed to delete webinar run" },

        { status: 500 }

      );

    }



    return NextResponse.json({ success: true });

  } catch (e) {

    console.error("Unexpected error:", e);

    return NextResponse.json(

      { success: false, error: "Internal server error" },

      { status: 500 }

    );

  }

}


