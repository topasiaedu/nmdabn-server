import { type NextRequest, NextResponse } from "next/server";
import { parseProjectAgencyLineTags } from "@/config/traffic";
import { supabase } from "@/config/supabase";
import type { Json } from "@/database.types";
import { nextResponseFromGuard } from "@/lib/guard-response";
import { parseJsonObjectBody } from "@/lib/parse-json-body";
import { requireAuthAndWorkspace } from "@/middleware/workspace";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/projects/:id
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

  try {
    const { data, error } = await supabase
      .from("projects")
      .select("*")
      .eq("id", id)
      .eq("workspace_id", session.workspaceId)
      .single();

    if (error) {
      console.error("Error fetching project:", error);
      return NextResponse.json(
        { success: false, error: "Project not found" },
        { status: 404 }
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
 * PATCH /api/projects/:id
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
  const body = parsed.body;
  const name = body.name;
  const description = body.description;
  const ghlLocationIdBody = body.ghl_location_id;
  const zoomIntegrationAccountBody = body.zoom_integration_account_id;
  const occupationFieldBody = body.traffic_occupation_field_id;
  const occupationFieldKeyBody = body.traffic_occupation_field_key;
  const agencyTagsBody = body.traffic_agency_line_tags;

  try {
    const { data: existingProject, error: fetchError } = await supabase
      .from("projects")
      .select("id")
      .eq("id", id)
      .eq("workspace_id", session.workspaceId)
      .single();

    if (fetchError !== null || existingProject === null) {
      return NextResponse.json(
        { success: false, error: "Project not found" },
        { status: 404 }
      );
    }

    const updateData: Record<string, unknown> = {};
    if (name !== undefined) {
      updateData.name = name;
    }
    if (description !== undefined) {
      updateData.description = description;
    }

    if (ghlLocationIdBody !== undefined) {
      if (ghlLocationIdBody === null || ghlLocationIdBody === "") {
        updateData.ghl_location_id = null;
      } else if (typeof ghlLocationIdBody === "string") {
        updateData.ghl_location_id = ghlLocationIdBody.trim();
      } else {
        return NextResponse.json(
          { success: false, error: "ghl_location_id must be a string or null" },
          { status: 400 }
        );
      }
    }

    if (zoomIntegrationAccountBody !== undefined) {
      if (zoomIntegrationAccountBody === null || zoomIntegrationAccountBody === "") {
        updateData.zoom_integration_account_id = null;
      } else if (typeof zoomIntegrationAccountBody === "string") {
        updateData.zoom_integration_account_id = zoomIntegrationAccountBody.trim();
      } else {
        return NextResponse.json(
          {
            success: false,
            error: "zoom_integration_account_id must be a string or null",
          },
          { status: 400 }
        );
      }
    }

    if (occupationFieldBody !== undefined) {
      if (occupationFieldBody === null || occupationFieldBody === "") {
        updateData.traffic_occupation_field_id = null;
      } else if (typeof occupationFieldBody === "string") {
        updateData.traffic_occupation_field_id = occupationFieldBody.trim();
      } else {
        return NextResponse.json(
          {
            success: false,
            error: "traffic_occupation_field_id must be a string or null",
          },
          { status: 400 }
        );
      }
    }

    if (occupationFieldKeyBody !== undefined) {
      if (occupationFieldKeyBody === null || occupationFieldKeyBody === "") {
        updateData.traffic_occupation_field_key = null;
      } else if (typeof occupationFieldKeyBody === "string") {
        updateData.traffic_occupation_field_key = occupationFieldKeyBody.trim();
      } else {
        return NextResponse.json(
          {
            success: false,
            error: "traffic_occupation_field_key must be a string or null",
          },
          { status: 400 }
        );
      }
    }

    if (agencyTagsBody !== undefined) {
      if (agencyTagsBody === null) {
        updateData.traffic_agency_line_tags = null;
      } else {
        const tagsParsed = parseProjectAgencyLineTags(agencyTagsBody);
        if (tagsParsed === null) {
          return NextResponse.json(
            {
              success: false,
              error:
                "traffic_agency_line_tags must be null or an object like {\"OM\":[\"lead_om\"],\"NM\":[\"lead_nm\"]}",
            },
            { status: 400 }
          );
        }
        const asJson: Json = tagsParsed;
        updateData.traffic_agency_line_tags = asJson;
      }
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { success: false, error: "No fields to update" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("projects")
      .update(updateData)
      .eq("id", id)
      .eq("workspace_id", session.workspaceId)
      .select()
      .single();

    if (error) {
      console.error("Error updating project:", error);
      return NextResponse.json(
        { success: false, error: "Failed to update project" },
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
 * DELETE /api/projects/:id
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

  try {
    const { error } = await supabase
      .from("projects")
      .delete()
      .eq("id", id)
      .eq("workspace_id", session.workspaceId);

    if (error) {
      console.error("Error deleting project:", error);
      return NextResponse.json(
        { success: false, error: "Failed to delete project" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: { message: "Project deleted successfully" },
    });
  } catch (e) {
    console.error("Unexpected error:", e);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
