import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../database.types";
import {
  decryptGhlConnectionToken,
  loadGhlConnectionTokenEncryptionKeyFromEnv,
} from "./ghl-connection-token-crypto";

/**
 * In-memory bearer cache keyed by project id.
 * Cleared on process restart only (Phase 1 — no Redis).
 */

/** Seconds to subtract from Zoom `expires_in` so we refresh before actual expiry. */
const CACHE_SAFETY_MARGIN_SEC = 300;

/** Minimum time-to-live for a cached token (ms); avoids caching unusable near-zero TTL. */
const MIN_CACHE_TTL_MS = 60_000;

const ZOOM_TOKEN_URL = "https://zoom.us/oauth/token";

const accessTokenCache = new Map<
  string,
  { token: string; expiresAt: number }
>();

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Parses Zoom OAuth error JSON or returns a short text fallback.
 */
function zoomErrorMessageFromBody(bodyText: string, status: number): string {
  try {
    const parsed: unknown = JSON.parse(bodyText);
    if (!isRecord(parsed)) {
      return `HTTP ${String(status)}`;
    }
    const reason = parsed["reason"];
    if (typeof reason === "string" && reason.trim() !== "") {
      return reason.trim();
    }
    const error = parsed["error"];
    if (typeof error === "string" && error.trim() !== "") {
      return error.trim();
    }
  } catch {
    // use raw text below
  }
  const trimmed = bodyText.trim();
  return trimmed !== "" ? trimmed : `HTTP ${String(status)}`;
}

export interface ExchangeZoomAccountCredentialsInput {
  clientId: string;
  clientSecretPlaintext: string;
  accountId: string;
}

export interface ExchangeZoomAccountCredentialsResult {
  accessToken: string;
  expiresInSeconds: number;
}

/**
 * Server-to-Server OAuth token exchange (no caching). Used by
 * {@link getZoomAccessToken} and by the Zoom integration POST handler for validation.
 */
export async function exchangeZoomAccountCredentials(
  input: ExchangeZoomAccountCredentialsInput
): Promise<ExchangeZoomAccountCredentialsResult> {
  const { clientId, clientSecretPlaintext, accountId } = input;
  if (clientId.trim() === "") {
    throw new Error("Zoom client_id is empty");
  }
  if (clientSecretPlaintext.trim() === "") {
    throw new Error("Zoom client_secret is empty");
  }
  if (accountId.trim() === "") {
    throw new Error("Zoom account_id is empty");
  }

  const params = new URLSearchParams();
  params.set("grant_type", "account_credentials");
  params.set("account_id", accountId);

  const url = `${ZOOM_TOKEN_URL}?${params.toString()}`;
  const basic = Buffer.from(
    `${clientId}:${clientSecretPlaintext}`,
    "utf8"
  ).toString("base64");

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "",
  });

  const bodyText = await response.text();

  if (!response.ok) {
    const msg = zoomErrorMessageFromBody(bodyText, response.status);
    throw new Error(msg);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(bodyText) as unknown;
  } catch {
    throw new Error("Zoom token response was not valid JSON");
  }

  if (!isRecord(parsed)) {
    throw new Error("Zoom token response JSON was not an object");
  }

  const accessTokenRaw = parsed["access_token"];
  const expiresInRaw = parsed["expires_in"];

  if (typeof accessTokenRaw !== "string" || accessTokenRaw === "") {
    throw new Error("Zoom token response missing access_token");
  }

  let expiresInSeconds: number;
  if (typeof expiresInRaw === "number" && Number.isFinite(expiresInRaw)) {
    expiresInSeconds = expiresInRaw;
  } else if (typeof expiresInRaw === "string") {
    const n = Number.parseInt(expiresInRaw, 10);
    if (!Number.isFinite(n)) {
      throw new Error("Zoom token response has invalid expires_in");
    }
    expiresInSeconds = n;
  } else {
    throw new Error("Zoom token response missing expires_in");
  }

  return {
    accessToken: accessTokenRaw,
    expiresInSeconds,
  };
}

/**
 * Returns a cached or freshly exchanged Zoom S2S bearer token for a project.
 * Credentials are stored directly on the `projects` row (zoom_client_id,
 * zoom_account_id, zoom_client_secret_encrypted).
 */
export async function getZoomAccessToken(
  projectId: string,
  supabaseClient: SupabaseClient<Database>
): Promise<string> {
  const trimmedId = projectId.trim();
  if (trimmedId === "") {
    throw new Error("project_id is required");
  }

  const cacheKey = `project:${trimmedId}`;
  const now = Date.now();
  const cached = accessTokenCache.get(cacheKey);
  if (cached !== undefined && now < cached.expiresAt) {
    return cached.token;
  }

  const { data: row, error } = await supabaseClient
    .from("projects")
    .select("id, zoom_client_id, zoom_account_id, zoom_client_secret_encrypted")
    .eq("id", trimmedId)
    .maybeSingle();

  if (error !== null) {
    throw new Error(`projects lookup failed: ${error.message}`);
  }
  if (row === null) {
    throw new Error(`No projects row for id ${trimmedId}`);
  }

  const clientId =
    typeof row.zoom_client_id === "string" && row.zoom_client_id.trim() !== ""
      ? row.zoom_client_id.trim()
      : null;
  const accountId =
    typeof row.zoom_account_id === "string" && row.zoom_account_id.trim() !== ""
      ? row.zoom_account_id.trim()
      : null;

  if (clientId === null) {
    throw new Error(
      `project ${trimmedId} has no zoom_client_id; configure Zoom credentials in project settings`
    );
  }
  if (accountId === null) {
    throw new Error(
      `project ${trimmedId} has no zoom_account_id; configure Zoom credentials in project settings`
    );
  }

  const enc = row.zoom_client_secret_encrypted;
  if (enc === null || enc === undefined || String(enc).trim() === "") {
    throw new Error(
      `project ${trimmedId} has no zoom_client_secret_encrypted; configure Zoom credentials in project settings`
    );
  }

  const ciphertext = String(enc);
  let key;
  try {
    key = loadGhlConnectionTokenEncryptionKeyFromEnv();
  } catch (e) {
    const msg = e instanceof Error ? e.message : "key load failed";
    throw new Error(`Cannot decrypt Zoom client_secret: ${msg}`);
  }

  let plaintext: string;
  try {
    plaintext = decryptGhlConnectionToken(ciphertext, key);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "decrypt failed";
    throw new Error(`Zoom client_secret decrypt failed: ${msg}`);
  }

  const { accessToken, expiresInSeconds } = await exchangeZoomAccountCredentials({
    clientId,
    clientSecretPlaintext: plaintext,
    accountId,
  });

  const ttlMs = Math.max(
    MIN_CACHE_TTL_MS,
    (expiresInSeconds - CACHE_SAFETY_MARGIN_SEC) * 1000
  );

  accessTokenCache.set(cacheKey, {
    token: accessToken,
    expiresAt: Date.now() + ttlMs,
  });

  return accessToken;
}
