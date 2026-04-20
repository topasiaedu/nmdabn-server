import type { SupabaseClient } from "@supabase/supabase-js";
import { env } from "@/config/env";
import type { Database } from "@/database.types";

const GRAPH_API_VERSION = "v21.0";
const META_GRAPH_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

/** Refresh this many milliseconds before the stored expiry when deciding to exchange tokens. */
const REFRESH_WITHIN_MS = 7 * 24 * 60 * 60 * 1000;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Parses Meta Graph error bodies `{ "error": { "message", "type", "code" } }`.
 */
function metaErrorMessageFromBody(bodyText: string, status: number): string {
  try {
    const parsed: unknown = JSON.parse(bodyText);
    if (!isRecord(parsed)) {
      return `Meta API HTTP ${String(status)}`;
    }
    const err = parsed["error"];
    if (isRecord(err)) {
      const msg = err["message"];
      if (typeof msg === "string" && msg.trim() !== "") {
        return msg.trim();
      }
    }
  } catch {
    // use raw text below
  }
  const trimmed = bodyText.trim();
  return trimmed !== "" ? trimmed : `Meta API HTTP ${String(status)}`;
}

/**
 * GET token exchange on Graph host (query string already includes params).
 */
async function fetchMetaTokenExchange(fullPath: string): Promise<Record<string, unknown>> {
  const url = `${META_GRAPH_BASE}${fullPath.startsWith("/") ? fullPath : `/${fullPath}`}`;
  const res = await fetch(url, { method: "GET" });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(metaErrorMessageFromBody(text, res.status));
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`Meta token response is not JSON (HTTP ${String(res.status)})`);
  }
  if (!isRecord(parsed)) {
    throw new Error("Meta token response JSON is not an object");
  }
  return parsed;
}

/**
 * Returns a valid Meta Marketing API access token for the given integration account,
 * refreshing the long-lived user token when it is missing or within seven days of expiry.
 *
 * @param integrationAccountId — `integration_accounts.id` with `provider = 'meta_ads'`.
 * @param supabase — Supabase client with permission to read/update `integration_accounts`.
 */
export async function getMetaAccessToken(
  integrationAccountId: string,
  supabase: SupabaseClient<Database>
): Promise<string> {
  if (env.meta === undefined) {
    throw new Error(
      "Meta Ads OAuth is not configured (set META_APP_ID, META_APP_SECRET, META_REDIRECT_URI)"
    );
  }

  const { data: row, error: fetchError } = await supabase
    .from("integration_accounts")
    .select(
      "id, provider, access_token, expires_at, workspace_id"
    )
    .eq("id", integrationAccountId)
    .maybeSingle();

  if (fetchError !== null) {
    throw new Error(
      `Failed to load integration account: ${fetchError.message}`
    );
  }

  if (row === null) {
    throw new Error(
      `Integration account not found for id ${integrationAccountId}`
    );
  }

  if (row.provider !== "meta_ads") {
    throw new Error(
      `Integration account ${integrationAccountId} is not a Meta Ads account (provider=${String(row.provider)})`
    );
  }

  const token = row.access_token;
  if (token === null || token.trim() === "") {
    throw new Error(
      `Meta Ads integration account ${integrationAccountId} has no access_token`
    );
  }

  const nowMs = Date.now();
  let expiryMs: number | null = null;
  if (row.expires_at !== null && row.expires_at !== "") {
    const parsed = Date.parse(row.expires_at);
    if (!Number.isNaN(parsed)) {
      expiryMs = parsed;
    }
  }

  const shouldRefresh =
    expiryMs === null ||
    expiryMs <= nowMs + REFRESH_WITHIN_MS;

  if (!shouldRefresh) {
    return token;
  }

  const params = new URLSearchParams({
    grant_type: "fb_exchange_token",
    client_id: env.meta.appId,
    client_secret: env.meta.appSecret,
    fb_exchange_token: token,
  });

  const exchanged = await fetchMetaTokenExchange(
    `/oauth/access_token?${params.toString()}`
  );

  const newToken = exchanged["access_token"];
  const expiresInRaw = exchanged["expires_in"];
  if (typeof newToken !== "string" || newToken.trim() === "") {
    throw new Error("Meta token refresh did not return access_token");
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
    throw new Error("Meta token refresh returned invalid expires_in");
  }

  const newExpiresIso = new Date(
    Date.now() + expiresInSec * 1000
  ).toISOString();

  const { error: updateError } = await supabase
    .from("integration_accounts")
    .update({
      access_token: newToken,
      expires_at: newExpiresIso,
      updated_at: new Date().toISOString(),
    })
    .eq("id", integrationAccountId);

  if (updateError !== null) {
    throw new Error(
      `Failed to store refreshed Meta token: ${updateError.message}`
    );
  }

  return newToken;
}
