import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "../database.types";
import { getZoomAccessToken } from "./zoom-token";

const INSERT_CHUNK = 100;
const ZOOM_PAGE_SIZE = "300";

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
 * Returns true if a journey_events row already exists for this run + participant email in payload.
 */
async function journeyEventExistsForEmail(
  supabase: SupabaseClient<Database>,
  webinarRunId: string,
  normalizedEmail: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from("journey_events")
    .select("id")
    .eq("webinar_run_id", webinarRunId)
    .filter("payload->>user_email", "eq", normalizedEmail)
    .maybeSingle();

  if (error !== null) {
    throw new Error(
      `journey_events idempotency check failed: ${error.message}`
    );
  }
  return data !== null;
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
  inserted: number;
  skipped: number;
}

/**
 * Pulls Zoom participant report for one `webinar_runs` row and upserts `journey_events` (insert-only with select-first idempotency).
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

  const { data: project, error: projectError } = await supabaseClient
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

  const accessToken = await getZoomAccessToken(
    zoomAccountId,
    supabaseClient
  );

  const pages = await fetchZoomParticipantPages(
    accessToken,
    zoomMeetingId,
    zst
  );

  let inserted = 0;
  let skipped = 0;
  /** Rows waiting for batched insert. */
  const pending: Database["public"]["Tables"]["journey_events"]["Insert"][] =
    [];

  const locationId = run.location_id;
  const flushPending = async (): Promise<void> => {
    if (pending.length === 0) {
      return;
    }
    const { error } = await supabaseClient
      .from("journey_events")
      .insert(pending);
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
      supabaseClient,
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

    const { data: contactRow, error: contactError } = await supabaseClient
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
      payload: buildPayload(participant, zoomMeetingId),
    });

    if (pending.length >= INSERT_CHUNK) {
      await flushPending();
    }
  }

  await flushPending();

  return { inserted, skipped };
}
