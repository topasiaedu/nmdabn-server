import { type NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";
import { env } from "@/config/env";
import { supabase } from "@/config/supabase";

export const runtime = "nodejs";

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isOAuthState(
  v: unknown
): v is { workspaceId: string; customState?: string } {
  if (!isRecord(v)) {
    return false;
  }
  const w = v.workspaceId;
  return typeof w === "string" && w.length > 0;
}

/**
 * GET /api/auth/google/callback — OAuth redirect target (query: code, state).
 * Returns 501 when GOOGLE_CLIENT_ID / SECRET / REDIRECT_URI are not configured.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  if (env.google === undefined) {
    return new NextResponse("Google OAuth is not configured on this server", {
      status: 501,
    });
  }

  const oauth2Client = new google.auth.OAuth2(
    env.google.clientId,
    env.google.clientSecret,
    env.google.redirectUri
  );

  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");

  if (code === null || code === "") {
    return new NextResponse("Missing authorization code", { status: 400 });
  }

  if (state === null || state === "") {
    return new NextResponse("Missing state parameter", { status: 400 });
  }

  let workspaceId: string;
  let customState = "";
  try {
    const decoded = Buffer.from(state, "base64").toString("utf-8");
    let parsed: unknown;
    try {
      parsed = JSON.parse(decoded);
    } catch {
      return new NextResponse("Invalid state parameter", { status: 400 });
    }
    if (!isOAuthState(parsed)) {
      return new NextResponse("Invalid state parameter", { status: 400 });
    }
    workspaceId = parsed.workspaceId;
    const cs = parsed.customState;
    customState = typeof cs === "string" ? cs : "";
  } catch {
    return new NextResponse("Invalid state parameter", { status: 400 });
  }

  try {
    const { tokens } = await oauth2Client.getToken(code);

    if (
      tokens.access_token === undefined ||
      tokens.access_token === null ||
      tokens.access_token === ""
    ) {
      return new NextResponse("Failed to obtain access token", { status: 500 });
    }

    oauth2Client.setCredentials(tokens);
    const oauth2 = google.oauth2({ version: "v2", auth: oauth2Client });
    const { data: userInfo } = await oauth2.userinfo.get();

    const { error: insertError } = await supabase
      .from("integration_accounts")
      .insert({
        workspace_id: workspaceId,
        provider: "google_sheets",
        display_name: userInfo.email ?? "Google Account",
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token ?? null,
        expires_at: tokens.expiry_date
          ? new Date(tokens.expiry_date).toISOString()
          : null,
        extra: {
          scope: tokens.scope,
          token_type: tokens.token_type,
          user_email: userInfo.email,
        },
        is_default: false,
      });

    if (insertError) {
      console.error("Error storing tokens:", insertError);
      return new NextResponse("Failed to store integration credentials", {
        status: 500,
      });
    }

    const proto = env.server.nodeEnv === "production" ? "https" : "http";
    const redirectUrl = `${proto}://your-frontend-url/integrations/google/success?state=${encodeURIComponent(customState)}`;
    return NextResponse.redirect(redirectUrl);
  } catch (e) {
    console.error("OAuth callback error:", e);
    return new NextResponse("Authentication failed", { status: 500 });
  }
}
