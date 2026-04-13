import { supabase } from "../config/supabase";
import { parseProjectAgencyLineTags } from "../config/traffic";
import type { Json } from "../database.types";

export interface ProjectTrafficSettings {
  projectId: string;
  projectName: string;
  ghlLocationId: string;
  occupationFieldId: string;
  agencyLineTags: Record<string, string[]>;
}

async function resolveOccupationFieldIdByKey(input: {
  locationId: string;
  fieldKeyOrName: string;
}): Promise<string | null> {
  const key = input.fieldKeyOrName.trim();
  if (key === "") {
    return null;
  }
  const { data, error } = await supabase
    .from("ghl_custom_fields")
    .select("field_id, field_key, field_name")
    .eq("location_id", input.locationId);

  if (error !== null || data === null) {
    return null;
  }

  const lowered = key.toLowerCase();
  const byKey = data.find((row) =>
    typeof row.field_key === "string" &&
    row.field_key.trim().toLowerCase() === lowered
  );
  if (byKey?.field_id) {
    return byKey.field_id;
  }
  const byName = data.find((row) =>
    typeof row.field_name === "string" &&
    row.field_name.trim().toLowerCase() === lowered
  );
  return byName?.field_id ?? null;
}

/**
 * Loads GHL location id, occupation field id, and optional tag map for Traffic.
 */
export async function fetchProjectTrafficSettings(
  projectId: string,
  workspaceId: string,
  fallbackAgencyTags: Record<string, string[]>
): Promise<ProjectTrafficSettings | { error: string }> {
  const trimmedProject = projectId.trim();
  const trimmedWs = workspaceId.trim();
  if (trimmedProject === "" || trimmedWs === "") {
    return { error: "project_id and workspace_id are required" };
  }

  const { data: row, error } = await supabase
    .from("projects")
    .select(
      "id, name, workspace_id, ghl_location_id, traffic_occupation_field_id, traffic_occupation_field_key, traffic_agency_line_tags"
    )
    .eq("id", trimmedProject)
    .eq("workspace_id", trimmedWs)
    .maybeSingle();

  if (error !== null) {
    return { error: `Failed to load project: ${error.message}` };
  }
  if (row === null) {
    return { error: "Project not found in this workspace" };
  }

  const ghlLocationId =
    typeof row.ghl_location_id === "string" ? row.ghl_location_id.trim() : "";
  if (ghlLocationId === "") {
    return {
      error:
        "Project has no ghl_location_id; set it via PATCH /api/projects/:id (GoHighLevel sub-account id).",
    };
  }

  let occupationFieldId =
    typeof row.traffic_occupation_field_id === "string"
      ? row.traffic_occupation_field_id.trim()
      : "";
  if (occupationFieldId === "") {
    const occKey =
      typeof row.traffic_occupation_field_key === "string"
        ? row.traffic_occupation_field_key.trim()
        : "";
    if (occKey !== "") {
      const resolved = await resolveOccupationFieldIdByKey({
        locationId: ghlLocationId,
        fieldKeyOrName: occKey,
      });
      if (resolved !== null) {
        occupationFieldId = resolved;
      }
    }
  }
  if (occupationFieldId === "") {
    return {
      error:
        "Project occupation mapping missing. Set traffic_occupation_field_key (preferred) or traffic_occupation_field_id on this project, then run custom field sync.",
    };
  }

  const fromProject = parseProjectAgencyLineTags(row.traffic_agency_line_tags);
  const agencyLineTags =
    fromProject !== null ? fromProject : fallbackAgencyTags;

  return {
    projectId: row.id,
    projectName: row.name,
    ghlLocationId,
    occupationFieldId,
    agencyLineTags,
  };
}

/**
 * Agency tag map for /traffic/lines when user is authenticated (optional project override).
 */
export function resolveAgencyLineTagsForRequest(
  projectTags: Json | null | undefined,
  fallback: Record<string, string[]>
): Record<string, string[]> {
  const parsed = parseProjectAgencyLineTags(projectTags as unknown);
  if (parsed !== null) {
    return parsed;
  }
  return fallback;
}
