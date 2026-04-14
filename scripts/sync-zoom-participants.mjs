/**
 * Pulls Zoom participant report for one webinar run and inserts journey_events rows.
 * Mirrors src/services/zoom-participants-sync.ts (kept in sync manually — no TS import).
 *
 * Usage:
 *   node --env-file=.env scripts/sync-zoom-participants.mjs --webinar-run-id=<uuid>
 *
 * Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GHL_CONNECTION_TOKEN_ENCRYPTION_KEY
 */
import { createClient } from "@supabase/supabase-js";
import {
  decryptGhlConnectionToken,
  parseGhlConnectionTokenEncryptionKey,
} from "./lib/ghl-connection-token-crypto.mjs";

const INSERT_CHUNK = 100;
const ZOOM_PAGE_SIZE = "300";
const CACHE_SAFETY_MARGIN_SEC = 300;
const MIN_CACHE_TTL_MS = 60_000;
const ZOOM_TOKEN_URL = "https://accounts.zoom.us/oauth/token";

/** @type {Map<string, { token: string; expiresAt: number }>} */
const accessTokenCache = new Map();

/**
 * @param {unknown} v
 * @returns {v is Record<string, unknown>}
 */
function isRecord(v) {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * @param {string} name
 * @param {string | undefined} value
 * @returns {string}
 */
function requireEnv(name, value) {
  if (value === undefined || value === "") {
    throw new Error(`Missing ${name}`);
  }
  return value;
}

function parseArgs() {
  /** @type {{ webinarRunId: string }} */
  const out = { webinarRunId: "" };
  for (const a of process.argv.slice(2)) {
    if (a.startsWith("--webinar-run-id=")) {
      out.webinarRunId = a.slice("--webinar-run-id=".length);
    }
  }
  return out;
}

/**
 * @param {unknown} raw
 * @returns {number}
 */
function durationToSeconds(raw) {
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return Math.max(0, Math.floor(raw));
  }
  if (typeof raw === "string" && raw.trim() !== "") {
    const n = Number.parseInt(raw, 10);
    if (Number.isFinite(n)) {
      return Math.max(0, n);
    }
  }
  return 0;
}

/**
 * @param {string} bodyText
 * @param {number} status
 * @returns {string}
 */
function zoomErrorMessageFromBody(bodyText, status) {
  try {
    const parsed = JSON.parse(bodyText);
    if (!isRecord(parsed)) {
      return `HTTP ${String(status)}`;
    }
    const reason = parsed["reason"];
    if (typeof reason === "string" && reason.trim() !== "") {
      return reason.trim();
    }
    const err = parsed["error"];
    if (typeof err === "string" && err.trim() !== "") {
      return err.trim();
    }
  } catch {
    // ignore
  }
  const trimmed = bodyText.trim();
  return trimmed !== "" ? trimmed : `HTTP ${String(status)}`;
}

/**
 * @param {{ clientId: string; clientSecretPlaintext: string; accountId: string }} input
 * @returns {Promise<{ accessToken: string; expiresInSeconds: number }>}
 */
async function exchangeZoomAccountCredentials(input) {
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
    throw new Error(zoomErrorMessageFromBody(bodyText, response.status));
  }

  let parsed;
  try {
    parsed = JSON.parse(bodyText);
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
  let expiresInSeconds;
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
  return { accessToken: accessTokenRaw, expiresInSeconds };
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {string} integrationAccountId
 * @param {Buffer} key
 * @returns {Promise<string>}
 */
async function getZoomAccessToken(supabase, integrationAccountId, key) {
  const trimmedId = integrationAccountId.trim();
  if (trimmedId === "") {
    throw new Error("integration_account_id is required");
  }

  const now = Date.now();
  const cached = accessTokenCache.get(trimmedId);
  if (cached !== undefined && now < cached.expiresAt) {
    return cached.token;
  }

  const { data: row, error } = await supabase
    .from("integration_accounts")
    .select("id, client_id, account_id, client_secret_encrypted")
    .eq("id", trimmedId)
    .maybeSingle();

  if (error !== null) {
    throw new Error(`integration_accounts lookup failed: ${error.message}`);
  }
  if (row === null) {
    throw new Error(`No integration_accounts row for id ${trimmedId}`);
  }

  const clientId =
    typeof row.client_id === "string" && row.client_id.trim() !== ""
      ? row.client_id.trim()
      : null;
  const accountId =
    typeof row.account_id === "string" && row.account_id.trim() !== ""
      ? row.account_id.trim()
      : null;

  if (clientId === null) {
    throw new Error(
      `integration_accounts ${trimmedId} has no client_id; cannot obtain Zoom token`
    );
  }
  if (accountId === null) {
    throw new Error(
      `integration_accounts ${trimmedId} has no account_id; cannot obtain Zoom token`
    );
  }

  const enc = row.client_secret_encrypted;
  if (enc === null || enc === undefined || String(enc).trim() === "") {
    throw new Error(
      `integration_accounts ${trimmedId} has no client_secret_encrypted; configure Zoom credentials`
    );
  }

  let plaintext;
  try {
    plaintext = decryptGhlConnectionToken(String(enc), key);
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
  accessTokenCache.set(trimmedId, {
    token: accessToken,
    expiresAt: Date.now() + ttlMs,
  });
  return accessToken;
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {string} webinarRunId
 * @param {string} normalizedEmail
 * @returns {Promise<boolean>}
 */
async function journeyEventExistsForEmail(supabase, webinarRunId, normalizedEmail) {
  const { data, error } = await supabase
    .from("journey_events")
    .select("id")
    .eq("webinar_run_id", webinarRunId)
    .filter("payload->>user_email", "eq", normalizedEmail)
    .maybeSingle();

  if (error !== null) {
    throw new Error(`journey_events idempotency check failed: ${error.message}`);
  }
  return data !== null;
}

/**
 * @param {string} accessToken
 * @param {string} zoomMeetingId
 * @param {"meeting" | "webinar"} zoomSourceType
 * @returns {Promise<Record<string, unknown>[]>}
 */
async function fetchZoomParticipantPages(
  accessToken,
  zoomMeetingId,
  zoomSourceType
) {
  const pathSeg = encodeURIComponent(zoomMeetingId);
  const baseUrl =
    zoomSourceType === "meeting"
      ? `https://api.zoom.us/v2/report/meetings/${pathSeg}/participants`
      : `https://api.zoom.us/v2/report/webinars/${pathSeg}/participants`;

  /** @type {Record<string, unknown>[]} */
  const out = [];
  let nextPageToken = null;

  for (;;) {
    const url = new URL(baseUrl);
    url.searchParams.set("page_size", ZOOM_PAGE_SIZE);
    if (nextPageToken !== null && nextPageToken !== "") {
      url.searchParams.set("next_page_token", nextPageToken);
    }

    const response = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    const bodyText = await response.text();
    if (!response.ok) {
      throw new Error(
        `Zoom participants API HTTP ${String(response.status)}: ${bodyText.slice(0, 500)}`
      );
    }

    let parsed;
    try {
      parsed = JSON.parse(bodyText);
    } catch {
      throw new Error("Zoom participants response was not valid JSON");
    }
    if (!isRecord(parsed)) {
      throw new Error("Zoom participants response JSON was not an object");
    }

    const participantsRaw = parsed["participants"];
    const list = Array.isArray(participantsRaw) ? participantsRaw : [];
    for (const item of list) {
      if (isRecord(item)) {
        out.push(item);
      }
    }

    const tokenRaw = parsed["next_page_token"];
    if (typeof tokenRaw === "string" && tokenRaw.trim() !== "") {
      nextPageToken = tokenRaw.trim();
    } else {
      break;
    }
  }

  return out;
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {string} webinarRunId
 * @param {Buffer} key
 * @returns {Promise<{ inserted: number; skipped: number }>}
 */
async function syncZoomParticipantsForRun(supabase, webinarRunId, key) {
  const trimmedRunId = webinarRunId.trim();
  if (trimmedRunId === "") {
    throw new Error("webinar_run_id is required");
  }

  const { data: run, error: runError } = await supabase
    .from("webinar_runs")
    .select("id, zoom_meeting_id, zoom_source_type, project_id, location_id")
    .eq("id", trimmedRunId)
    .maybeSingle();

  if (runError !== null) {
    throw new Error(`webinar_runs lookup failed: ${runError.message}`);
  }
  if (run === null) {
    throw new Error(`No webinar_runs row for id ${trimmedRunId}`);
  }

  const zoomMeetingRaw = run.zoom_meeting_id;
  const zoomMeetingId =
    typeof zoomMeetingRaw === "string" && zoomMeetingRaw.trim() !== ""
      ? zoomMeetingRaw.trim()
      : null;

  if (zoomMeetingId === null) {
    console.log(
      `syncZoomParticipantsForRun: webinar_run ${trimmedRunId} has no zoom_meeting_id; skipping`
    );
    return { inserted: 0, skipped: 0 };
  }

  const projectIdRaw = run.project_id;
  if (projectIdRaw === null || projectIdRaw === "") {
    throw new Error(
      `webinar_run ${trimmedRunId} has no project_id; cannot resolve Zoom integration account`
    );
  }

  const zst = run.zoom_source_type;
  if (zst !== "meeting" && zst !== "webinar") {
    throw new Error(
      `webinar_run ${trimmedRunId} has invalid zoom_source_type (expected meeting or webinar)`
    );
  }

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("id, zoom_integration_account_id")
    .eq("id", projectIdRaw)
    .maybeSingle();

  if (projectError !== null) {
    throw new Error(`projects lookup failed: ${projectError.message}`);
  }
  if (project === null) {
    throw new Error(`No projects row for id ${projectIdRaw}`);
  }

  const zoomAccountId = project.zoom_integration_account_id;
  if (zoomAccountId === null || zoomAccountId === "") {
    throw new Error(
      `project ${projectIdRaw} has no zoom_integration_account_id; link a Zoom integration account`
    );
  }

  const accessToken = await getZoomAccessToken(supabase, zoomAccountId, key);

  const pages = await fetchZoomParticipantPages(
    accessToken,
    zoomMeetingId,
    zst
  );

  let inserted = 0;
  let skipped = 0;
  /** @type {Record<string, unknown>[]} */
  const pending = [];

  const locationId = run.location_id;

  const flushPending = async () => {
    if (pending.length === 0) {
      return;
    }
    const { error } = await supabase.from("journey_events").insert(pending);
    if (error !== null) {
      throw new Error(`journey_events batch insert failed: ${error.message}`);
    }
    inserted += pending.length;
    pending.length = 0;
  };

  for (const participant of pages) {
    const emailRaw = participant["user_email"];
    const email =
      typeof emailRaw === "string" ? emailRaw.toLowerCase().trim() : "";

    if (email === "") {
      skipped += 1;
      continue;
    }

    const exists = await journeyEventExistsForEmail(
      supabase,
      trimmedRunId,
      email
    );
    if (exists) {
      skipped += 1;
      continue;
    }

    const joinTimeRaw = participant["join_time"];
    if (typeof joinTimeRaw !== "string" || joinTimeRaw.trim() === "") {
      console.warn(
        "syncZoomParticipantsForRun: skipping participant with no join_time (email redacted)"
      );
      skipped += 1;
      continue;
    }
    const occurredAt = joinTimeRaw.trim();

    const { data: contactRow, error: contactError } = await supabase
      .from("ghl_contacts")
      .select("id")
      .eq("email", email)
      .eq("location_id", locationId)
      .maybeSingle();

    if (contactError !== null) {
      throw new Error(`ghl_contacts lookup failed: ${contactError.message}`);
    }

    const contactId =
      contactRow !== null && typeof contactRow.id === "string"
        ? contactRow.id
        : null;

    pending.push({
      occurred_at: occurredAt,
      event_type: "attended",
      source_system: "zoom",
      contact_id: contactId,
      location_id: locationId,
      project_id: projectIdRaw,
      webinar_run_id: trimmedRunId,
      duration_seconds: durationToSeconds(participant["duration"]),
      payload: { ...participant, zoom_meeting_id: zoomMeetingId },
    });

    if (pending.length >= INSERT_CHUNK) {
      await flushPending();
    }
  }

  await flushPending();

  return { inserted, skipped };
}

async function main() {
  const args = parseArgs();
  if (args.webinarRunId.trim() === "") {
    console.error("Required: --webinar-run-id=<uuid>");
    process.exit(1);
  }

  const url = requireEnv("SUPABASE_URL", process.env.SUPABASE_URL);
  const srk = requireEnv(
    "SUPABASE_SERVICE_ROLE_KEY",
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
  const encRaw = requireEnv(
    "GHL_CONNECTION_TOKEN_ENCRYPTION_KEY",
    process.env.GHL_CONNECTION_TOKEN_ENCRYPTION_KEY
  );

  const key = parseGhlConnectionTokenEncryptionKey(encRaw);
  const supabase = createClient(url, srk);

  const { inserted, skipped } = await syncZoomParticipantsForRun(
    supabase,
    args.webinarRunId,
    key
  );
  console.log(`Zoom sync complete: inserted=${inserted} skipped=${skipped}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
