import { type NextRequest, NextResponse } from "next/server";
import { parseProjectAgencyLineTags } from "@/config/traffic";
import { supabase } from "@/config/supabase";
import type { Database, Json } from "@/database.types";
import { nextResponseFromGuard } from "@/lib/guard-response";
import { parseJsonObjectBody } from "@/lib/parse-json-body";
import { requireAuthAndWorkspace } from "@/middleware/workspace";

type ProjectInsert = Database["public"]["Tables"]["projects"]["Insert"];

/**
 * GET /api/projects — list projects for a workspace.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const session = await requireAuthAndWorkspace(request);
  if (!session.ok) {
    return nextResponseFromGuard(session);
  }

  try {
    const { data, error } = await supabase
      .from("projects")
      .select("*")
      .eq("workspace_id", session.workspaceId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching projects:", error);
      return NextResponse.json(
        { success: false, error: "Failed to fetch projects" },
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
 * POST /api/projects — create a project.
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
  const name = body.name;
  const description = body.description;
  const ghlLocationIdBody = body.ghl_location_id;
  const occupationFieldIdBody = body.traffic_occupation_field_id;
  const occupationFieldKeyBody = body.traffic_occupation_field_key;
  const agencyTagsBody = body.traffic_agency_line_tags;

  try {
    if (typeof name !== "string" || name.trim() === "") {
      return NextResponse.json(
        { success: false, error: "name is required" },
        { status: 400 }
      );
    }

    const insertData: ProjectInsert = {
      workspace_id: session.workspaceId,
      name: name.trim(),
      description:
        typeof description === "string" && description.trim() !== ""
          ? description
          : null,
    };

    if (ghlLocationIdBody !== undefined) {
      if (ghlLocationIdBody === null || ghlLocationIdBody === "") {
        insertData.ghl_location_id = null;
      } else if (typeof ghlLocationIdBody === "string") {
        insertData.ghl_location_id = ghlLocationIdBody.trim();
      } else {
        return NextResponse.json(
          { success: false, error: "ghl_location_id must be a string or null" },
          { status: 400 }
        );
      }
    }

    if (occupationFieldIdBody !== undefined) {
      if (occupationFieldIdBody === null || occupationFieldIdBody === "") {
        insertData.traffic_occupation_field_id = null;
      } else if (typeof occupationFieldIdBody === "string") {
        insertData.traffic_occupation_field_id = occupationFieldIdBody.trim();
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
        insertData.traffic_occupation_field_key = null;
      } else if (typeof occupationFieldKeyBody === "string") {
        insertData.traffic_occupation_field_key = occupationFieldKeyBody.trim();
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
        insertData.traffic_agency_line_tags = null;
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
        const lineTagsJson: Json = tagsParsed;
        insertData.traffic_agency_line_tags = lineTagsJson;
      }
    }

    const { data, error } = await supabase
      .from("projects")
      .insert(insertData)
      .select()
      .single();

    if (error) {
      console.error("Error creating project:", error);
      return NextResponse.json(
        { success: false, error: "Failed to create project" },
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
