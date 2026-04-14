import { type NextRequest, NextResponse } from "next/server";

import { supabase } from "@/config/supabase";

import { nextResponseFromGuard } from "@/lib/guard-response";

import { parseJsonObjectBody } from "@/lib/parse-json-body";

import { requireAuthAndWorkspace } from "@/middleware/workspace";

import {

  encryptGhlConnectionToken,

  loadGhlConnectionTokenEncryptionKeyFromEnv,

} from "@/services/ghl-connection-token-crypto";



export const runtime = "nodejs";



const GHL_CONNECTION_SAFE_COLUMNS =

  "id, project_id, ghl_location_id, is_active, created_at, updated_at";



type RouteContext = { params: Promise<{ id: string }> };



/**

 * Verifies the project exists in the caller's workspace. Returns null on success, or a NextResponse error.

 */

async function guardProjectInWorkspace(

  projectId: string,

  workspaceId: string

): Promise<NextResponse | null> {

  const { data: project, error } = await supabase

    .from("projects")

    .select("id")

    .eq("id", projectId)

    .eq("workspace_id", workspaceId)

    .single();



  if (error !== null || project === null) {

    return NextResponse.json(

      { success: false, error: "Project not found" },

      { status: 404 }

    );

  }

  return null;

}



/**

 * GET /api/projects/:id/connections/ghl — list GHL connections for a project (safe columns only).

 */

export async function GET(

  request: NextRequest,

  context: RouteContext

): Promise<NextResponse> {

  const session = await requireAuthAndWorkspace(request);

  if (!session.ok) {

    return nextResponseFromGuard(session);

  }



  const { id: projectId } = await context.params;



  const denied = await guardProjectInWorkspace(projectId, session.workspaceId);

  if (denied !== null) {

    return denied;

  }



  try {

    const { data, error } = await supabase

      .from("ghl_connections")

      .select(GHL_CONNECTION_SAFE_COLUMNS)

      .eq("project_id", projectId)

      .order("created_at", { ascending: false });



    if (error) {

      console.error("Error listing GHL connections:", error);

      return NextResponse.json(

        { success: false, error: "Failed to list GHL connections" },

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

 * POST /api/projects/:id/connections/ghl — create an encrypted GHL connection for a project.

 */

export async function POST(

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



  const { id: projectId } = await context.params;

  const ghlLocationId = parsed.body.ghl_location_id;

  const privateIntegrationToken = parsed.body.private_integration_token;



  const denied = await guardProjectInWorkspace(projectId, session.workspaceId);

  if (denied !== null) {

    return denied;

  }



  if (typeof ghlLocationId !== "string" || ghlLocationId.trim() === "") {

    return NextResponse.json(

      { success: false, error: "ghl_location_id is required" },

      { status: 400 }

    );

  }

  if (

    typeof privateIntegrationToken !== "string" ||

    privateIntegrationToken === ""

  ) {

    return NextResponse.json(

      { success: false, error: "private_integration_token is required" },

      { status: 400 }

    );

  }



  let privateIntegrationTokenEncrypted: string;

  try {

    const key = loadGhlConnectionTokenEncryptionKeyFromEnv();

    privateIntegrationTokenEncrypted = encryptGhlConnectionToken(

      privateIntegrationToken,

      key

    );

  } catch (err) {

    const message =

      err instanceof Error ? err.message : "Encryption key not available";

    console.error("GHL connection encrypt:", message);

    return NextResponse.json(

      {

        success: false,

        error:

          "Server encryption is not configured (missing or invalid GHL_CONNECTION_TOKEN_ENCRYPTION_KEY)",

      },

      { status: 503 }

    );

  }



  try {

    const { data, error } = await supabase

      .from("ghl_connections")

      .insert({

        project_id: projectId,

        ghl_location_id: ghlLocationId.trim(),

        private_integration_token_encrypted: privateIntegrationTokenEncrypted,

        is_active: true,

      })

      .select(GHL_CONNECTION_SAFE_COLUMNS)

      .single();



    if (error) {

      console.error("Error creating GHL connection:", error);

      return NextResponse.json(

        { success: false, error: "Failed to create GHL connection" },

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


