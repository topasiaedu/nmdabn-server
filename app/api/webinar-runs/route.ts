import { type NextRequest, NextResponse } from "next/server";

import { supabase } from "@/config/supabase";

import type { Database } from "@/database.types";

import { nextResponseFromGuard } from "@/lib/guard-response";

import { parseJsonObjectBody } from "@/lib/parse-json-body";

import { requireAuthAndWorkspace } from "@/middleware/workspace";



export const runtime = "nodejs";



type WebinarRunInsert = Database["public"]["Tables"]["webinar_runs"]["Insert"];



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



/**

 * GET /api/webinar-runs?workspace_id=... — list webinar runs for all projects in the workspace.

 */

export async function GET(request: NextRequest): Promise<NextResponse> {

  const session = await requireAuthAndWorkspace(request);

  if (!session.ok) {

    return nextResponseFromGuard(session);

  }



  try {

    const { data: projects, error: projectsError } = await supabase

      .from("projects")

      .select("id")

      .eq("workspace_id", session.workspaceId);



    if (projectsError) {

      console.error("Error fetching projects for webinar runs:", projectsError);

      return NextResponse.json(

        { success: false, error: "Failed to list webinar runs" },

        { status: 500 }

      );

    }



    const projectIds = (projects ?? []).map((p) => p.id);

    if (projectIds.length === 0) {

      return NextResponse.json({ success: true, data: [] });

    }



    const { data, error } = await supabase

      .from("webinar_runs")

      .select("*")

      .in("project_id", projectIds)

      .order("event_start_at", { ascending: false });



    if (error) {

      console.error("Error listing webinar runs:", error);

      return NextResponse.json(

        { success: false, error: "Failed to list webinar runs" },

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

 * POST /api/webinar-runs — create a webinar run.

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



  const body = parsed.body;

  const projectIdRaw = body.project_id;

  const displayLabel = body.display_label;

  const eventStartAtRaw = body.event_start_at;

  const eventEndAtRaw = body.event_end_at;

  const formatRaw = body.format;

  const locationId = body.location_id;

  const timezoneRaw = body.timezone;



  if (typeof projectIdRaw !== "string" || !isUuidString(projectIdRaw)) {

    return NextResponse.json(

      { success: false, error: "project_id must be a valid UUID string" },

      { status: 400 }

    );

  }



  if (typeof displayLabel !== "string" || displayLabel.trim() === "") {

    return NextResponse.json(

      { success: false, error: "display_label is required" },

      { status: 400 }

    );

  }



  if (typeof eventStartAtRaw !== "string") {

    return NextResponse.json(

      { success: false, error: "event_start_at must be a non-empty ISO timestamp string" },

      { status: 400 }

    );

  }

  if (typeof eventEndAtRaw !== "string") {

    return NextResponse.json(

      { success: false, error: "event_end_at must be a non-empty ISO timestamp string" },

      { status: 400 }

    );

  }



  const eventStartAt = parseIsoTimestamp(eventStartAtRaw);

  const eventEndAt = parseIsoTimestamp(eventEndAtRaw);

  if (eventStartAt === null || eventEndAt === null) {

    return NextResponse.json(

      {

        success: false,

        error: "event_start_at and event_end_at must be valid ISO timestamp strings",

      },

      { status: 400 }

    );

  }



  if (typeof formatRaw !== "string" || formatRaw.trim() === "") {

    return NextResponse.json(

      { success: false, error: "format is required" },

      { status: 400 }

    );

  }

  if (typeof locationId !== "string" || locationId.trim() === "") {

    return NextResponse.json(

      { success: false, error: "location_id is required" },

      { status: 400 }

    );

  }

  if (typeof timezoneRaw !== "string" || timezoneRaw.trim() === "") {

    return NextResponse.json(

      { success: false, error: "timezone is required" },

      { status: 400 }

    );

  }



  const zoomMeetingIdBody = body.zoom_meeting_id;

  const zoomSourceTypeBody = body.zoom_source_type;

  const isActiveBody = body.is_active;

  const sortOrderBody = body.sort_order;



  let zoomMeetingId: string | null = null;

  if (zoomMeetingIdBody !== undefined && zoomMeetingIdBody !== null) {

    if (typeof zoomMeetingIdBody !== "string") {

      return NextResponse.json(

        { success: false, error: "zoom_meeting_id must be a string or null" },

        { status: 400 }

      );

    }

    zoomMeetingId = zoomMeetingIdBody === "" ? null : zoomMeetingIdBody;

  }



  let zoomSourceType: string | null = null;

  if (zoomSourceTypeBody !== undefined) {

    if (zoomSourceTypeBody === null) {

      zoomSourceType = null;

    } else if (zoomSourceTypeBody === "meeting" || zoomSourceTypeBody === "webinar") {

      zoomSourceType = zoomSourceTypeBody;

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



  let isActive = true;

  if (isActiveBody !== undefined) {

    if (typeof isActiveBody !== "boolean") {

      return NextResponse.json(

        { success: false, error: "is_active must be a boolean" },

        { status: 400 }

      );

    }

    isActive = isActiveBody;

  }



  let sortOrder: number | null = null;

  if (sortOrderBody !== undefined && sortOrderBody !== null) {

    if (typeof sortOrderBody !== "number" || !Number.isInteger(sortOrderBody)) {

      return NextResponse.json(

        { success: false, error: "sort_order must be an integer or null" },

        { status: 400 }

      );

    }

    sortOrder = sortOrderBody;

  }



  try {

    const { data: projectRow, error: projectError } = await supabase

      .from("projects")

      .select("id")

      .eq("id", projectIdRaw)

      .eq("workspace_id", session.workspaceId)

      .single();



    if (projectError !== null || projectRow === null) {

      return NextResponse.json(

        { success: false, error: "Project not found" },

        { status: 404 }

      );

    }



    const insert: WebinarRunInsert = {

      project_id: projectIdRaw,

      display_label: displayLabel.trim(),

      event_start_at: eventStartAt,

      event_end_at: eventEndAt,

      format: formatRaw.trim(),

      location_id: locationId.trim(),

      timezone: timezoneRaw.trim(),

      zoom_meeting_id: zoomMeetingId,

      zoom_source_type: zoomSourceType,

      is_active: isActive,

      sort_order: sortOrder,

    };



    const { data, error } = await supabase

      .from("webinar_runs")

      .insert(insert)

      .select("*")

      .single();



    if (error) {

      console.error("Error creating webinar run:", error);

      return NextResponse.json(

        { success: false, error: "Failed to create webinar run" },

        { status: 500 }

      );

    }



    return NextResponse.json({ success: true, data }, { status: 201 });

  } catch (e) {

    console.error("Unexpected error:", e);

    return NextResponse.json(

      { success: false, error: "Internal server error" },

      { status: 500 }

    );

  }

}


