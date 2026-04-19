import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "../database.types";
import { getZoomAccessToken } from "./zoom-token";

const ZOOM_PAGE_SIZE = "300";

/** Prefix for in-app contacts created from Zoom when email is not in GHL. */
const APP_ONLY_CONTACT_PREFIX = "nmdapp-";

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Normalizes Zoom report `duration` to whole seconds (missing → 0).
 */
function durationToSeconds(raw: unknown): number {
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
 * Builds payload for `journey_events`: Zoom participant fields plus `zoom_meeting_id` for idempotency.
 */
function buildPayload(
  participant: Record<string, unknown>,
  zoomMeetingId: string
): Json {
  return {
    ...participant,
    zoom_meeting_id: zoomMeetingId,
  } as Json;
}

/**
 * Zoom participant `id` or `user_id` when present, for idempotency without email.
 */
function zoomParticipantStableId(participant: Record<string, unknown>): string {
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
 */
function buildSegmentIdempotencyKey(
  webinarRunId: string,
  participant: Record<string, unknown>,
  normalizedEmail: string
): string | null {
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

function parseIsoTimestamptzOrNull(v: unknown): string | null {
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
 * Returns GHL-mirrored contact id, or creates an app-only row (never synced to GHL).
 */
async function resolveOrCreateContactForZoomParticipant(
  supabase: SupabaseClient<Database>,
  args: {
    projectId: string;
    locationId: string;
    normalizedEmail: string;
    participant: Record<string, unknown>;
  }
): Promise<string | null> {
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
      raw_json: args.participant as Json,
      api_top_level_extras: {} as Json,
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

type SegmentRow = Database["public"]["Tables"]["zoom_attendance_segments"]["Insert"];

/**
 * Upserts one `zoom_attendance_segments` row (composite unique on webinar_run + idempotency_key).
 */
async function upsertZoomAttendanceSegment(
  supabase: SupabaseClient<Database>,
  row: SegmentRow
): Promise<void> {
  const { error } = await supabase
    .from("zoom_attendance_segments")
    .upsert(row, { onConflict: "webinar_run_id,idempotency_key" });
  if (error !== null) {
    throw new Error(`zoom_attendance_segments upsert failed: ${error.message}`);
  }
}

/**
 * Inserts or updates the single `journey_events` rollup row (zoom + attended) per contact per run.
 */
async function upsertZoomAttendedJourneyRollup(
  supabase: SupabaseClient<Database>,
  args: {
    webinarRunId: string;
    projectId: string;
    locationId: string;
    zoomMeetingId: string;
    contactId: string;
  }
): Promise<"inserted" | "updated"> {
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
  let firstPayload: Record<string, unknown> | null = null;

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
      firstPayload = s.raw_payload as Record<string, unknown>;
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
  const payload: Json = {
    ...basePayload,
    zoom_segment_count: list.length,
    zoom_total_duration_seconds: totalSeconds,
  } as Json;

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
 * Fetches all pages of Zoom meeting or webinar participant reports.
 */
async function fetchZoomParticipantPages(
  accessToken: string,
  zoomMeetingId: string,
  zoomSourceType: "meeting" | "webinar"
): Promise<Record<string, unknown>[]> {
  const pathSeg = encodeURIComponent(zoomMeetingId);
  const baseUrl =
    zoomSourceType === "meeting"
      ? `https://api.zoom.us/v2/report/meetings/${pathSeg}/participants`
      : `https://api.zoom.us/v2/report/webinars/${pathSeg}/participants`;

  const out: Record<string, unknown>[] = [];
  let nextPageToken: string | null = null;

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

    let parsed: unknown;
    try {
      parsed = JSON.parse(bodyText) as unknown;
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

export interface SyncZoomParticipantsResult {
  /** New `journey_events` rollup rows inserted this run. */
  inserted: number;
  /** Participant rows skipped (missing join time and no idempotency key). */
  skipped: number;
  /** `zoom_attendance_segments` upserts (insert + update). */
  segmentsUpserted: number;
  /** Existing rollup rows updated (duration / payload refreshed). */
  rollupsUpdated: number;
}

/**
 * Pulls Zoom participant report for one `webinar_runs` row; upserts `zoom_attendance_segments`
 * and maintains one `journey_events` attended rollup per contact per run.
 */
export async function syncZoomParticipantsForRun(
  webinarRunId: string,
  supabaseClient: SupabaseClient<Database>
): Promise<SyncZoomParticipantsResult> {
  const trimmedRunId = webinarRunId.trim();
  if (trimmedRunId === "") {
    throw new Error("webinar_run_id is required");
  }

  const { data: run, error: runError } = await supabaseClient
    .from("webinar_runs")
    .select(
      "id, zoom_meeting_id, zoom_source_type, project_id, location_id"
    )
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
      `webinar_run ${trimmedRunId} has no project_id; cannot resolve Zoom integration account`
    );
  }

  const zst = run.zoom_source_type;
  if (zst !== "meeting" && zst !== "webinar") {
    throw new Error(
      `webinar_run ${trimmedRunId} has invalid zoom_source_type (expected meeting or webinar)`
    );
  }

  const accessToken = await getZoomAccessToken(projectIdRaw, supabaseClient);

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
  const contactsToRollup = new Set<string>();

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

    let contactId: string | null = null;
    if (emailNorm !== "") {
      contactId = await resolveOrCreateContactForZoomParticipant(
        supabaseClient,
        {
          projectId: projectIdRaw,
          locationId,
          normalizedEmail: emailNorm,
          participant,
        }
      );
      if (contactId !== null) {
        contactsToRollup.add(contactId);
      }
    }

    const segRow: SegmentRow = {
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

    await upsertZoomAttendanceSegment(supabaseClient, segRow);
    segmentsUpserted += 1;
  }

  for (const cid of contactsToRollup) {
    const outcome = await upsertZoomAttendedJourneyRollup(supabaseClient, {
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

/** Export for tests / callers that need to skip GHL mirror for synthetic ids. */
export function isAppOnlyGhlContactId(contactId: string): boolean {
  return contactId.startsWith(APP_ONLY_CONTACT_PREFIX);
}
