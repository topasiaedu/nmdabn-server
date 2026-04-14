import { type NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";
import { env } from "@/config/env";
import { nextResponseFromGuard } from "@/lib/guard-response";
import { requireAuthAndWorkspace } from "@/middleware/workspace";

const SCOPES = [
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/drive.readonly",
];

export const runtime = "nodejs";

/**
 * GET /api/auth/google/authorize — build Google OAuth URL (requires Bearer + workspace_id).
 * Returns 501 when GOOGLE_CLIENT_ID / SECRET / REDIRECT_URI are not configured.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  if (env.google === undefined) {
    return NextResponse.json(
      { success: false, error: "Google OAuth is not configured on this server" },
      { status: 501 }
    );
  }

  const session = await requireAuthAndWorkspace(request);
  if (!session.ok) {
    return nextResponseFromGuard(session);
  }

  try {
    const oauth2Client = new google.auth.OAuth2(
      env.google.clientId,
      env.google.clientSecret,
      env.google.redirectUri
    );

    const stateParam = request.nextUrl.searchParams.get("state") ?? "";
    const stateData = JSON.stringify({
      workspaceId: session.workspaceId,
      customState: stateParam,
    });

    const authUrl = oauth2Client.generateAuthUrl({
      access_type: "offline",
      scope: SCOPES,
      state: Buffer.from(stateData).toString("base64"),
      prompt: "consent",
    });

    return NextResponse.json({
      success: true,
      data: { authUrl },
    });
  } catch (e) {
    console.error("Error generating auth URL:", e);
    return NextResponse.json(
      { success: false, error: "Failed to generate authorization URL" },
      { status: 500 }
    );
  }
}
