import { type NextRequest, NextResponse } from "next/server";
import { env } from "@/config/env";
import { nextResponseFromGuard } from "@/lib/guard-response";
import { requireAuthAndWorkspace } from "@/middleware/workspace";

export const runtime = "nodejs";

const FACEBOOK_OAUTH_DIALOG = "https://www.facebook.com/v21.0/dialog/oauth";

const META_SCOPES = ["ads_management", "ads_read", "business_management"];

/**
 * GET /api/auth/meta/authorize — builds Meta OAuth URL for connecting an ad account to a project agency line.
 * Requires Bearer auth and workspace_id; query params `project_id` and `agency_line`.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  if (env.meta === undefined) {
    return NextResponse.json(
      {
        success: false,
        error: "Meta Ads OAuth is not configured on this server",
      },
      { status: 501 }
    );
  }

  const session = await requireAuthAndWorkspace(request);
  if (!session.ok) {
    return nextResponseFromGuard(session);
  }

  const projectIdRaw = request.nextUrl.searchParams.get("project_id")?.trim() ?? "";
  const agencyLineRaw =
    request.nextUrl.searchParams.get("agency_line")?.trim() ?? "";

  if (projectIdRaw === "") {
    return NextResponse.json(
      { success: false, error: "project_id query parameter is required" },
      { status: 400 }
    );
  }

  if (agencyLineRaw === "") {
    return NextResponse.json(
      { success: false, error: "agency_line query parameter is required" },
      { status: 400 }
    );
  }

  try {
    const statePayload = {
      workspaceId: session.workspaceId,
      projectId: projectIdRaw,
      agencyLine: agencyLineRaw,
    };

    const stateEncoded = Buffer.from(JSON.stringify(statePayload)).toString(
      "base64"
    );

    const params = new URLSearchParams({
      client_id: env.meta.appId,
      redirect_uri: env.meta.redirectUri,
      state: stateEncoded,
      response_type: "code",
      scope: META_SCOPES.join(","),
    });

    const authUrl = `${FACEBOOK_OAUTH_DIALOG}?${params.toString()}`;

    return NextResponse.json({
      success: true,
      data: { authUrl },
    });
  } catch (e) {
    console.error("Meta authorize: failed to build URL", e);
    return NextResponse.json(
      { success: false, error: "Failed to build Meta authorization URL" },
      { status: 500 }
    );
  }
}
