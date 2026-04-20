import { type NextRequest, NextResponse } from "next/server";
import { env } from "@/config/env";
import { supabase } from "@/config/supabase";

export const runtime = "nodejs";

const GRAPH_API_VERSION = "v21.0";
const META_GRAPH_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

interface MetaOAuthState {
  workspaceId: string;
  projectId: string;
  agencyLine: string;
}

function isMetaOAuthState(v: unknown): v is MetaOAuthState {
  if (!isRecord(v)) {
    return false;
  }
  const w = v["workspaceId"];
  const p = v["projectId"];
  const a = v["agencyLine"];
  return (
    typeof w === "string" &&
    w.length > 0 &&
    typeof p === "string" &&
    p.length > 0 &&
    typeof a === "string" &&
    a.length > 0
  );
}

/**
 * Truncates a response body for error messages (avoids huge HTML in logs).
 */
function truncateBody(text: string, maxChars: number): string {
  const t = text.trim();
  if (t.length <= maxChars) {
    return t;
  }
  return `${t.slice(0, maxChars)}…`;
}

/**
 * POST form body to Meta Graph `oauth/access_token`; throws with status + body excerpt on failure.
 */
async function metaPostAccessToken(
  params: Record<string, string>
): Promise<Record<string, unknown>> {
  const url = `${META_GRAPH_BASE}/oauth/access_token`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(params),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(
      `Meta token HTTP ${String(res.status)}: ${truncateBody(text, 500)}`
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(
      `Meta token response is not JSON (HTTP ${String(res.status)})`
    );
  }
  if (!isRecord(parsed)) {
    throw new Error("Meta token response JSON is not an object");
  }
  const err = parsed["error"];
  if (isRecord(err)) {
    const msg = err["message"];
    if (typeof msg === "string" && msg.trim() !== "") {
      throw new Error(`Meta API error: ${msg.trim()}`);
    }
  }
  return parsed;
}

/**
 * Parses Meta Graph JSON list responses `{ data: [...] }`.
 */
function extractDataArray(body: Record<string, unknown>): unknown[] {
  const data = body["data"];
  if (!Array.isArray(data)) {
    return [];
  }
  return data;
}

/**
 * GET /api/auth/meta/callback — Meta redirects here with `code` and `state`; exchanges tokens and stores credentials.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  if (env.meta === undefined) {
    return new NextResponse("Meta Ads OAuth is not configured on this server", {
      status: 501,
    });
  }

  const code = request.nextUrl.searchParams.get("code");
  const stateParam = request.nextUrl.searchParams.get("state");

  if (code === null || code === "") {
    return new NextResponse("Missing authorization code", { status: 400 });
  }

  if (stateParam === null || stateParam === "") {
    return new NextResponse("Missing state parameter", { status: 400 });
  }

  let state: MetaOAuthState;
  try {
    const decoded = Buffer.from(stateParam, "base64").toString("utf-8");
    let parsed: unknown;
    try {
      parsed = JSON.parse(decoded);
    } catch {
      return new NextResponse("Invalid state parameter", { status: 400 });
    }
    if (!isMetaOAuthState(parsed)) {
      return new NextResponse("Invalid state parameter", { status: 400 });
    }
    state = parsed;
  } catch {
    return new NextResponse("Invalid state parameter", { status: 400 });
  }

  try {
    const shortLived = await metaPostAccessToken({
      client_id: env.meta.appId,
      client_secret: env.meta.appSecret,
      redirect_uri: env.meta.redirectUri,
      code,
    });

    const shortToken = shortLived["access_token"];
    if (typeof shortToken !== "string" || shortToken.trim() === "") {
      throw new Error("Short-lived token exchange did not return access_token");
    }

    const longLived = await metaPostAccessToken({
      grant_type: "fb_exchange_token",
      client_id: env.meta.appId,
      client_secret: env.meta.appSecret,
      fb_exchange_token: shortToken,
    });

    const longToken = longLived["access_token"];
    const expiresInRaw = longLived["expires_in"];
    if (typeof longToken !== "string" || longToken.trim() === "") {
      throw new Error("Long-lived token exchange did not return access_token");
    }

    let expiresInSec = 0;
    if (typeof expiresInRaw === "number" && Number.isFinite(expiresInRaw)) {
      expiresInSec = Math.floor(expiresInRaw);
    } else if (typeof expiresInRaw === "string" && expiresInRaw.trim() !== "") {
      const n = Number.parseInt(expiresInRaw, 10);
      if (!Number.isNaN(n)) {
        expiresInSec = n;
      }
    }
    if (expiresInSec <= 0) {
      throw new Error("Long-lived token exchange returned invalid expires_in");
    }

    const expiresAtIso = new Date(
      Date.now() + expiresInSec * 1000
    ).toISOString();

    const adAccountsUrl = `${META_GRAPH_BASE}/me/adaccounts?${new URLSearchParams(
      {
        fields: "account_id,name,currency",
        access_token: longToken,
      }
    ).toString()}`;

    const adRes = await fetch(adAccountsUrl, { method: "GET" });
    const adText = await adRes.text();
    if (!adRes.ok) {
      throw new Error(
        `Meta adaccounts HTTP ${String(adRes.status)}: ${truncateBody(adText, 500)}`
      );
    }

    let adParsed: unknown;
    try {
      adParsed = JSON.parse(adText);
    } catch {
      throw new Error(
        `Meta adaccounts response is not JSON (HTTP ${String(adRes.status)})`
      );
    }
    if (!isRecord(adParsed)) {
      throw new Error("Meta adaccounts response is not an object");
    }

    const accounts = extractDataArray(adParsed);
    if (accounts.length === 0) {
      return new NextResponse(
        "No Meta ad accounts were returned for this user. Grant access to an ad account in Meta Business settings, then try again.",
        { status: 400 }
      );
    }

    const first = accounts[0];
    if (!isRecord(first)) {
      throw new Error("Meta adaccounts: first row is not an object");
    }

    const graphAccountId = first["id"];
    const numericAccountId = first["account_id"];
    const displayName = first["name"];
    const currency = first["currency"];

    if (typeof graphAccountId !== "string" || graphAccountId.trim() === "") {
      throw new Error("Meta adaccounts row missing id (act_…)");
    }

    const displayNameResolved =
      typeof displayName === "string" && displayName.trim() !== ""
        ? displayName.trim()
        : graphAccountId;

    const numericAsString =
      typeof numericAccountId === "string"
        ? numericAccountId
        : typeof numericAccountId === "number"
          ? String(numericAccountId)
          : "";

    /**
     * The unique index on integration_accounts(workspace_id, provider, account_id)
     * is a PARTIAL index (WHERE account_id IS NOT NULL), which PostgreSQL ON CONFLICT
     * inference cannot match without the WHERE predicate. We therefore do an explicit
     * select-then-update-or-insert instead of relying on upsert conflict resolution.
     */
    const extraPayload = {
      currency:
        typeof currency === "string" && currency.trim() !== ""
          ? currency.trim()
          : null,
      ad_account_id_numeric:
        numericAsString !== "" ? numericAsString : null,
    };
    const nowIso = new Date().toISOString();

    const { data: existingRow, error: lookupError } = await supabase
      .from("integration_accounts")
      .select("id")
      .eq("workspace_id", state.workspaceId)
      .eq("provider", "meta_ads")
      .eq("account_id", graphAccountId)
      .maybeSingle();

    if (lookupError !== null) {
      console.error("Meta callback: integration_accounts lookup error", lookupError);
      return new NextResponse(
        "Failed to check for existing Meta integration",
        { status: 500 }
      );
    }

    let integrationAccountId: string;

    if (existingRow !== null) {
      const { error: updateError } = await supabase
        .from("integration_accounts")
        .update({
          display_name: displayNameResolved,
          access_token: longToken,
          expires_at: expiresAtIso,
          extra: extraPayload,
          updated_at: nowIso,
        })
        .eq("id", existingRow.id);

      if (updateError !== null) {
        console.error("Meta callback: integration_accounts update error", updateError);
        return new NextResponse(
          "Failed to update Meta integration credentials",
          { status: 500 }
        );
      }
      integrationAccountId = existingRow.id;
    } else {
      const { data: insertedRow, error: insertError } = await supabase
        .from("integration_accounts")
        .insert({
          workspace_id: state.workspaceId,
          provider: "meta_ads",
          display_name: displayNameResolved,
          account_id: graphAccountId,
          access_token: longToken,
          expires_at: expiresAtIso,
          extra: extraPayload,
          is_default: false,
          updated_at: nowIso,
        })
        .select("id")
        .single();

      if (insertError !== null || insertedRow === null) {
        console.error("Meta callback: integration_accounts insert error", insertError);
        return new NextResponse(
          "Failed to store Meta integration credentials",
          { status: 500 }
        );
      }
      integrationAccountId = insertedRow.id;
    }

    const { error: linkError } = await supabase
      .from("project_meta_ad_accounts")
      .insert({
        project_id: state.projectId,
        integration_account_id: integrationAccountId,
        agency_line: state.agencyLine,
      });

    if (linkError !== null) {
      const isDup =
        linkError.code === "23505" ||
        linkError.message.toLowerCase().includes("duplicate");
      if (!isDup) {
        console.error(
          "Meta callback: project_meta_ad_accounts insert error",
          linkError
        );
        return new NextResponse(
          "Failed to link Meta account to project",
          { status: 500 }
        );
      }
    }

    const redirectTarget = new URL("/settings", request.nextUrl.origin);
    redirectTarget.searchParams.set("meta_connected", "1");
    return NextResponse.redirect(redirectTarget);
  } catch (e) {
    console.error("Meta OAuth callback error:", e);
    const msg =
      e instanceof Error ? e.message : "Authentication failed unexpectedly";
    return new NextResponse(msg, { status: 500 });
  }
}
