/**
 * Pulls Zoom participant report for one webinar run; upserts `zoom_attendance_segments`
 * and maintains one `journey_events` attended rollup per contact per run.
 * Mirrors `src/services/zoom-participants-sync.ts` (kept in sync manually — no TS import).
 *
 * Usage:
 *   node --env-file=.env scripts/sync-zoom-participants.mjs --webinar-run-id=<uuid>
 *
 * Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GHL_CONNECTION_TOKEN_ENCRYPTION_KEY
 */
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import {
  decryptGhlConnectionToken,
  parseGhlConnectionTokenEncryptionKey,
} from "./lib/ghl-connection-token-crypto.mjs";

const ZOOM_PAGE_SIZE = "300";
const CACHE_SAFETY_MARGIN_SEC = 300;
const MIN_CACHE_TTL_MS = 60_000;
const ZOOM_TOKEN_URL = "https://zoom.us/oauth/token";

/** Prefix for in-app contacts created from Zoom when email is not in GHL. */
const APP_ONLY_CONTACT_PREFIX = "nmdapp-";

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
 * Normalizes Zoom report `duration` to whole seconds (missing → 0).
 *
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
 * @param {Record<string, unknown>} participant
 * @param {string} zoomMeetingId
 * @returns {Record<string, unknown>}
 */
function buildPayload(participant, zoomMeetingId) {
  return { ...participant, zoom_meeting_id: zoomMeetingId };
}

/**
 * Zoom participant `id` or `user_id` when present, for idempotency without email.
 *
 * @param {Record<string, unknown>} participant
 * @returns {string}
 */
function zoomParticipantStableId(participant) {
  const idRaw = participant["id"];
  if (typeof idRaw === "string" && idRaw.trim() !== "") {
    return idRaw.trim();
  }
  const userRaw = participant["user_id"];
  if (typeof userRaw === "string" && userRaw.trim() !== "") {
    return userRaw.trim();
  }
  return "";
}

/**
 * Stable key per webinar run + participant identity + join time (re-sync safe).
 *
 * @param {string} webinarRunId
 * @param {Record<string, unknown>} participant
 * @param {string} normalizedEmail
 * @returns {string | null}
 */
function buildSegmentIdempotencyKey(webinarRunId, participant, normalizedEmail) {
  const joinRaw = participant["join_time"];
  const join =
    typeof joinRaw === "string" && joinRaw.trim() !== ""
      ? joinRaw.trim()
      : "";
  if (join === "") {
    return null;
  }
  if (normalizedEmail !== "") {
    return `${webinarRunId}|e:${normalizedEmail}|j:${join}`;
  }
  const zid = zoomParticipantStableId(participant);
  if (zid !== "") {
    return `${webinarRunId}|z:${zid}|j:${join}`;
  }
  return null;
}

/**
 * @param {unknown} v
 * @returns {string | null}
 */
function parseIsoTimestamptzOrNull(v) {
  if (typeof v !== "string" || v.trim() === "") {
    return null;
  }
  const ms = Date.parse(v.trim());
  if (Number.isNaN(ms)) {
    return null;
  }
  return new Date(ms).toISOString();
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
 * Fetches a Zoom access token for a project using credentials stored on the project row.
 *
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {string} projectId
 * @param {Buffer} key
 * @returns {Promise<string>}
 */
async function getZoomAccessToken(supabase, projectId, key) {
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

  const { data: row, error } = await supabase
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
  accessTokenCache.set(cacheKey, {
    token: accessToken,
    expiresAt: Date.now() + ttlMs,
  });
  return accessToken;
}

/**
 * Returns GHL-mirrored contact id, or creates an app-only row (never synced to GHL).
 *
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {{ projectId: string; locationId: string; normalizedEmail: string; participant: Record<string, unknown> }} args
 * @returns {Promise<string | null>}
 */
async function resolveOrCreateContactForZoomParticipant(supabase, args) {
  const email = args.normalizedEmail;
  if (email === "") {
    return null;
  }

  const { data: ghlRow, error: ghlErr } = await supabase
    .from("ghl_contacts")
    .select("id")
    .eq("email", email)
    .eq("location_id", args.locationId)
    .eq("is_app_only", false)
    .order("id", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (ghlErr !== null) {
    throw new Error(`ghl_contacts lookup failed: ${ghlErr.message}`);
  }
  if (ghlRow !== null && typeof ghlRow.id === "string" && ghlRow.id !== "") {
    return ghlRow.id;
  }

  const { data: appRow, error: appErr } = await supabase
    .from("ghl_contacts")
    .select("id")
    .eq("app_only_project_id", args.projectId)
    .eq("is_app_only", true)
    .eq("email", email)
    .order("id", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (appErr !== null) {
    throw new Error(`ghl_contacts app-only lookup failed: ${appErr.message}`);
  }
  if (appRow !== null && typeof appRow.id === "string" && appRow.id !== "") {
    return appRow.id;
  }

  const newId = `${APP_ONLY_CONTACT_PREFIX}${randomUUID()}`;
  const nameRaw = args.participant["name"];
  const contactName =
    typeof nameRaw === "string" && nameRaw.trim() !== ""
      ? nameRaw.trim()
      : email;

  const { data: inserted, error: insErr } = await supabase
    .from("ghl_contacts")
    .insert({
      id: newId,
      location_id: args.locationId,
      email,
      contact_name: contactName,
      is_app_only: true,
      app_only_project_id: args.projectId,
      source: "zoom_app_only",
      raw_json: args.participant,
      api_top_level_extras: {},
    })
    .select("id")
    .maybeSingle();

  if (insErr !== null) {
    if (insErr.code === "23505") {
      const { data: again, error: againErr } = await supabase
        .from("ghl_contacts")
        .select("id")
        .eq("app_only_project_id", args.projectId)
        .eq("is_app_only", true)
        .eq("email", email)
        .order("id", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (againErr !== null) {
        throw new Error(`ghl_contacts app-only refetch failed: ${againErr.message}`);
      }
      if (again !== null && typeof again.id === "string") {
        return again.id;
      }
    }
    throw new Error(`ghl_contacts app-only insert failed: ${insErr.message}`);
  }
  if (inserted !== null && typeof inserted.id === "string") {
    return inserted.id;
  }
  return newId;
}

/**
 * Upserts one `zoom_attendance_segments` row (composite unique on webinar_run + idempotency_key).
 *
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {Record<string, unknown>} row
 * @returns {Promise<void>}
 */
async function upsertZoomAttendanceSegment(supabase, row) {
  const { error } = await supabase
    .from("zoom_attendance_segments")
    .upsert(row, { onConflict: "webinar_run_id,idempotency_key" });
  if (error !== null) {
    throw new Error(`zoom_attendance_segments upsert failed: ${error.message}`);
  }
}

/**
 * Inserts or updates the single `journey_events` rollup row (zoom + attended) per contact per run.
 *
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {{ webinarRunId: string; projectId: string; locationId: string; zoomMeetingId: string; contactId: string }} args
 * @returns {Promise<"inserted" | "updated">}
 */
async function upsertZoomAttendedJourneyRollup(supabase, args) {
  const { data: segs, error: segErr } = await supabase
    .from("zoom_attendance_segments")
    .select("join_at, duration_seconds, participant_email, raw_payload")
    .eq("webinar_run_id", args.webinarRunId)
    .eq("contact_id", args.contactId);

  if (segErr !== null) {
    throw new Error(`zoom_attendance_segments aggregate failed: ${segErr.message}`);
  }
  const list = segs ?? [];
  if (list.length === 0) {
    return "updated";
  }

  let totalSeconds = 0;
  let minJoinMs = Number.POSITIVE_INFINITY;
  let minJoinIso = "";
  /** @type {Record<string, unknown> | null} */
  let firstPayload = null;

  for (const s of list) {
    const dur =
      typeof s.duration_seconds === "number" && Number.isFinite(s.duration_seconds)
        ? s.duration_seconds
        : 0;
    totalSeconds += dur;
    const ja = s.join_at;
    if (typeof ja === "string") {
      const ms = Date.parse(ja);
      if (!Number.isNaN(ms) && ms < minJoinMs) {
        minJoinMs = ms;
        minJoinIso = ja;
      }
    }
    if (firstPayload === null && isRecord(s.raw_payload)) {
      firstPayload = s.raw_payload;
    }
  }

  const occurredAt =
    minJoinIso !== ""
      ? minJoinIso
      : typeof list[0]?.join_at === "string"
        ? list[0].join_at
        : new Date().toISOString();

  const basePayload =
    firstPayload !== null
      ? { ...firstPayload, zoom_meeting_id: args.zoomMeetingId }
      : { zoom_meeting_id: args.zoomMeetingId };
  const payload = {
    ...basePayload,
    zoom_segment_count: list.length,
    zoom_total_duration_seconds: totalSeconds,
  };

  const { data: existing, error: exErr } = await supabase
    .from("journey_events")
    .select("id")
    .eq("webinar_run_id", args.webinarRunId)
    .eq("contact_id", args.contactId)
    .eq("source_system", "zoom")
    .eq("event_type", "attended")
    .order("id", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (exErr !== null) {
    throw new Error(`journey_events rollup lookup failed: ${exErr.message}`);
  }

  if (existing !== null && typeof existing.id === "string") {
    const { error: upErr } = await supabase
      .from("journey_events")
      .update({
        occurred_at: occurredAt,
        duration_seconds: totalSeconds,
        payload,
      })
      .eq("id", existing.id);
    if (upErr !== null) {
      throw new Error(`journey_events rollup update failed: ${upErr.message}`);
    }
    return "updated";
  }

  const { error: insErr } = await supabase.from("journey_events").insert({
    occurred_at: occurredAt,
    event_type: "attended",
    source_system: "zoom",
    contact_id: args.contactId,
    location_id: args.locationId,
    project_id: args.projectId,
    webinar_run_id: args.webinarRunId,
    duration_seconds: totalSeconds,
    payload,
  });
  if (insErr !== null) {
    throw new Error(`journey_events rollup insert failed: ${insErr.message}`);
  }
  return "inserted";
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
 * @returns {Promise<{ inserted: number; skipped: number; segmentsUpserted: number; rollupsUpdated: number }>}
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
    return { inserted: 0, skipped: 0, segmentsUpserted: 0, rollupsUpdated: 0 };
  }

  const projectIdRaw = run.project_id;
  if (projectIdRaw === null || projectIdRaw === "") {
    throw new Error(
      `webinar_run ${trimmedRunId} has no project_id; cannot resolve Zoom credentials`
    );
  }

  const zst = run.zoom_source_type;
  if (zst !== "meeting" && zst !== "webinar") {
    throw new Error(
      `webinar_run ${trimmedRunId} has invalid zoom_source_type (expected meeting or webinar)`
    );
  }

  const accessToken = await getZoomAccessToken(supabase, projectIdRaw, key);

  const pages = await fetchZoomParticipantPages(
    accessToken,
    zoomMeetingId,
    zst
  );

  let inserted = 0;
  let skipped = 0;
  let segmentsUpserted = 0;
  let rollupsUpdated = 0;

  const locationId = run.location_id;
  const syncedAt = new Date().toISOString();
  /** @type {Set<string>} */
  const contactsToRollup = new Set();

  for (const participant of pages) {
    const emailRaw = participant["user_email"];
    const emailNorm =
      typeof emailRaw === "string" ? emailRaw.toLowerCase().trim() : "";

    const idemKey = buildSegmentIdempotencyKey(
      trimmedRunId,
      participant,
      emailNorm
    );
    if (idemKey === null) {
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
    const joinAtIso = parseIsoTimestamptzOrNull(joinTimeRaw.trim());
    if (joinAtIso === null) {
      skipped += 1;
      continue;
    }

    const leaveAtIso = parseIsoTimestamptzOrNull(participant["leave_time"]);
    const durSec = durationToSeconds(participant["duration"]);

    /** @type {string | null} */
    let contactId = null;
    if (emailNorm !== "") {
      contactId = await resolveOrCreateContactForZoomParticipant(supabase, {
        projectId: projectIdRaw,
        locationId,
        normalizedEmail: emailNorm,
        participant,
      });
      if (contactId !== null) {
        contactsToRollup.add(contactId);
      }
    }

    const segRow = {
      webinar_run_id: trimmedRunId,
      project_id: projectIdRaw,
      location_id: locationId,
      zoom_meeting_id: zoomMeetingId,
      idempotency_key: idemKey,
      participant_email: emailNorm === "" ? null : emailNorm,
      join_at: joinAtIso,
      leave_at: leaveAtIso,
      duration_seconds: durSec,
      contact_id: contactId,
      raw_payload: buildPayload(participant, zoomMeetingId),
      synced_at: syncedAt,
    };

    await upsertZoomAttendanceSegment(supabase, segRow);
    segmentsUpserted += 1;
  }

  for (const cid of contactsToRollup) {
    const outcome = await upsertZoomAttendedJourneyRollup(supabase, {
      webinarRunId: trimmedRunId,
      projectId: projectIdRaw,
      locationId,
      zoomMeetingId,
      contactId: cid,
    });
    if (outcome === "inserted") {
      inserted += 1;
    } else {
      rollupsUpdated += 1;
    }
  }

  return { inserted, skipped, segmentsUpserted, rollupsUpdated };
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

  const { inserted, skipped, segmentsUpserted, rollupsUpdated } =
    await syncZoomParticipantsForRun(supabase, args.webinarRunId, key);
  console.log(
    `Zoom sync complete: inserted=${String(inserted)} skipped=${String(skipped)} segmentsUpserted=${String(segmentsUpserted)} rollupsUpdated=${String(rollupsUpdated)}`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
