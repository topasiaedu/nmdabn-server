import { type NextRequest, NextResponse } from "next/server";
import { supabase } from "@/config/supabase";
import type { Database, Json } from "@/database.types";
import {
  loadIntegrationAccountIdsForProject,
  resolveMetaAttributionFromUtm,
} from "@/services/optin-meta-attribution";

export const runtime = "nodejs";

/** Maximum batch size accepted per request (silent discard beyond this index). */
const MAX_EVENTS_PER_REQUEST = 50;

/** Allowed values for `page_events.event_type` (matches migration 033 CHECK). */
const ALLOWED_PAGE_EVENT_TYPES = new Set([
  "pageview",
  "click",
  "scroll_depth",
  "optin",
  "mousemove",
  "identify",
]);

type PageEventInsert = Database["public"]["Tables"]["page_events"]["Insert"];

/**
 * Incoming event object from the tracking pixel (subset validated at runtime).
 */
export type TrackEventInput = {
  event_type: string;
  url?: string;
  referrer?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
  fbclid?: string;
  ghl_contact_id?: string;
  scroll_depth?: number;
  x?: number;
  y?: number;
  element_tag?: string;
  element_text?: string;
  payload?: Record<string, unknown>;
  occurred_at?: string;
};

/**
 * POST body shape for `/api/track`.
 */
export type TrackRequestBody = {
  site_id: string;
  session_id: string;
  events: TrackEventInput[];
};

/**
 * Returns true when `v` is a non-null plain object record.
 */
function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Returns true when `v` matches the recursive `Json` shape used by Supabase.
 */
function isJson(value: unknown): value is Json {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return true;
  }
  if (Array.isArray(value)) {
    return value.every((item) => isJson(item));
  }
  if (isRecord(value)) {
    return Object.entries(value).every(
      ([key, inner]) =>
        typeof key === "string" && (inner === undefined || isJson(inner))
    );
  }
  return false;
}

/**
 * Coerces an unknown payload into JSON-safe storage for `page_events.payload`.
 */
function payloadToJson(value: unknown): Json {
  if (!isRecord(value)) return {};
  const out: { [key: string]: Json | undefined } = {};
  for (const [key, inner] of Object.entries(value)) {
    if (isJson(inner)) out[key] = inner;
  }
  return out;
}

/**
 * Returns true when `v` is a string that parses to a finite instant.
 */
function isIsoDateString(v: unknown): v is string {
  if (typeof v !== "string" || v.trim() === "") return false;
  const ms = new Date(v).getTime();
  return Number.isFinite(ms);
}

/**
 * Clamps a numeric input to a 0–100 integer suitable for SMALLINT percent columns.
 */
function clampPercentInt(n: unknown): number | null {
  if (typeof n !== "number" || !Number.isFinite(n)) return null;
  return Math.min(100, Math.max(0, Math.round(n)));
}

/**
 * Truncates click text to match server storage limits.
 */
function truncateElementText(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.slice(0, 100);
  return t === "" ? null : t;
}

/**
 * Optional trimmed string → null when empty after trim.
 */
function nullableString(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t === "" ? null : t;
}

/**
 * Parses the raw POST body as JSON (tolerates missing or wrong Content-Type from sendBeacon).
 */
async function parseBodyJson(request: NextRequest): Promise<unknown> {
  const text = await request.text();
  if (text.trim() === "") return null;
  try {
    const result: unknown = JSON.parse(text);
    return result;
  } catch {
    return null;
  }
}

/**
 * Reads a string field from a record; returns `undefined` when absent or non-string.
 */
function takeString(src: Record<string, unknown>, key: string): string | undefined {
  const v = src[key];
  return typeof v === "string" ? v : undefined;
}

/**
 * Reads a number field from a record; returns `undefined` when absent or non-number.
 */
function takeNumber(src: Record<string, unknown>, key: string): number | undefined {
  const v = src[key];
  return typeof v === "number" ? v : undefined;
}

/**
 * Parses one array element into a {@link TrackEventInput} when structurally valid.
 */
function parseTrackEventItem(item: unknown): TrackEventInput | null {
  if (!isRecord(item)) return null;
  const et = item.event_type;
  if (typeof et !== "string") return null;
  return {
    event_type: et,
    url: takeString(item, "url"),
    referrer: takeString(item, "referrer"),
    utm_source: takeString(item, "utm_source"),
    utm_medium: takeString(item, "utm_medium"),
    utm_campaign: takeString(item, "utm_campaign"),
    utm_content: takeString(item, "utm_content"),
    utm_term: takeString(item, "utm_term"),
    fbclid: takeString(item, "fbclid"),
    ghl_contact_id: takeString(item, "ghl_contact_id"),
    scroll_depth: takeNumber(item, "scroll_depth"),
    x: takeNumber(item, "x"),
    y: takeNumber(item, "y"),
    element_tag: takeString(item, "element_tag"),
    element_text: takeString(item, "element_text"),
    payload: isRecord(item.payload) ? item.payload : undefined,
    occurred_at: takeString(item, "occurred_at"),
  };
}

/**
 * Validates the top-level request shape and returns a typed result or an error response.
 */
function validateTrackBody(
  body: unknown
):
  | { ok: true; data: TrackRequestBody & { acceptedCount: number } }
  | { ok: false; response: NextResponse } {
  if (!isRecord(body)) {
    return {
      ok: false,
      response: NextResponse.json(
        { success: false, error: "Body must be a JSON object" },
        { status: 400, headers: corsHeaders() }
      ),
    };
  }

  const siteIdRaw = body.site_id;
  const sessionIdRaw = body.session_id;
  const eventsRaw = body.events;

  if (typeof siteIdRaw !== "string" || siteIdRaw.trim() === "") {
    return {
      ok: false,
      response: NextResponse.json(
        { success: false, error: "site_id is required" },
        { status: 400, headers: corsHeaders() }
      ),
    };
  }

  if (typeof sessionIdRaw !== "string" || sessionIdRaw.trim() === "") {
    return {
      ok: false,
      response: NextResponse.json(
        { success: false, error: "session_id is required" },
        { status: 400, headers: corsHeaders() }
      ),
    };
  }

  if (!Array.isArray(eventsRaw)) {
    return {
      ok: false,
      response: NextResponse.json(
        { success: false, error: "events must be an array" },
        { status: 400, headers: corsHeaders() }
      ),
    };
  }

  const capped = eventsRaw.slice(0, MAX_EVENTS_PER_REQUEST);
  const events: TrackEventInput[] = [];
  for (const item of capped) {
    const parsed = parseTrackEventItem(item);
    if (parsed !== null) events.push(parsed);
  }

  return {
    ok: true,
    data: {
      site_id: siteIdRaw.trim(),
      session_id: sessionIdRaw.trim(),
      events,
      acceptedCount: capped.length,
    },
  };
}

/**
 * Builds the optional (nullable) columns of a {@link PageEventInsert} row from
 * one client event. Extracted to keep {@link mapEventToInsert} under the
 * cognitive-complexity limit.
 */
function buildOptionalEventFields(ev: TrackEventInput): Partial<PageEventInsert> {
  const fields: Partial<PageEventInsert> = {};
  const url = nullableString(ev.url);
  const referrer = nullableString(ev.referrer);
  const utmSource = nullableString(ev.utm_source);
  const utmMedium = nullableString(ev.utm_medium);
  const utmCampaign = nullableString(ev.utm_campaign);
  const utmContent = nullableString(ev.utm_content);
  const utmTerm = nullableString(ev.utm_term);
  const fbclid = nullableString(ev.fbclid);
  const ghlId = nullableString(ev.ghl_contact_id);
  const elementTag = nullableString(ev.element_tag);
  const elementText = truncateElementText(ev.element_text);
  const scrollDepth = clampPercentInt(ev.scroll_depth);
  const x = clampPercentInt(ev.x);
  const y = clampPercentInt(ev.y);

  if (url !== null) fields.url = url;
  if (referrer !== null) fields.referrer = referrer;
  if (utmSource !== null) fields.utm_source = utmSource;
  if (utmMedium !== null) fields.utm_medium = utmMedium;
  if (utmCampaign !== null) fields.utm_campaign = utmCampaign;
  if (utmContent !== null) fields.utm_content = utmContent;
  if (utmTerm !== null) fields.utm_term = utmTerm;
  if (fbclid !== null) fields.fbclid = fbclid;
  if (ghlId !== null) fields.ghl_contact_id = ghlId;
  if (elementTag !== null) fields.element_tag = elementTag;
  if (elementText !== null) fields.element_text = elementText;
  if (scrollDepth !== null) fields.scroll_depth = scrollDepth;
  if (x !== null) fields.x = x;
  if (y !== null) fields.y = y;
  return fields;
}

/**
 * Maps one client event plus context into a row for `page_events`.
 */
function mapEventToInsert(
  siteId: string,
  sessionId: string,
  ev: TrackEventInput
): PageEventInsert | null {
  if (!ALLOWED_PAGE_EVENT_TYPES.has(ev.event_type)) return null;

  const occurredAt =
    ev.occurred_at !== undefined && isIsoDateString(ev.occurred_at)
      ? ev.occurred_at
      : new Date().toISOString();

  return {
    project_id: siteId,
    session_id: sessionId,
    event_type: ev.event_type,
    occurred_at: occurredAt,
    payload: payloadToJson(ev.payload ?? {}),
    ...buildOptionalEventFields(ev),
  };
}

/**
 * CORS headers for embeds on external funnel domains (e.g. GHL).
 */
function corsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

/**
 * Handles CORS preflight for cross-origin POST from tracking pixel.
 */
export async function OPTIONS(): Promise<NextResponse> {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

/**
 * Builds the payload JSON for a journey_events row, merging base UTM fields with
 * any extra properties supplied by the caller.
 */
function buildJourneyPayload(
  ev: TrackEventInput,
  extra: Record<string, unknown> = {}
): Json {
  return {
    utm_source: ev.utm_source ?? null,
    utm_medium: ev.utm_medium ?? null,
    utm_campaign: ev.utm_campaign ?? null,
    utm_content: ev.utm_content ?? null,
    utm_term: ev.utm_term ?? null,
    url: ev.url ?? null,
    ...extra,
  } as Json;
}

/**
 * Attempts to upsert a journey_events row for a tracker optin.
 *
 * When the initial upsert fails with a FK violation (23503 — the GHL contact
 * hasn't been created by the webhook yet), retries with contact_id = null and
 * stores the ghl_contact_id inside the payload JSON so it can be reconciled
 * later. Duplicate retries are silently swallowed (23505).
 */
async function upsertTrackerJourneyEvent(
  ev: TrackEventInput,
  contactId: string,
  siteId: string,
  attribution: {
    meta_ad_id: string | null;
    meta_adset_id: string | null;
    meta_campaign_id: string | null;
    method: string | null;
  }
): Promise<void> {
  const occurredAt =
    ev.occurred_at !== undefined && isIsoDateString(ev.occurred_at)
      ? ev.occurred_at
      : new Date().toISOString();

  type JourneyInsert = Database["public"]["Tables"]["journey_events"]["Insert"];

  const journeyRow: JourneyInsert = {
    project_id: siteId,
    contact_id: contactId,
    event_type: "optin",
    source_system: "tracker",
    occurred_at: occurredAt,
    meta_ad_id: attribution.meta_ad_id,
    meta_adset_id: attribution.meta_adset_id,
    meta_campaign_id: attribution.meta_campaign_id,
    meta_attribution_method: attribution.method,
    payload: buildJourneyPayload(ev),
  };

  // Use INSERT (not upsert) because the only unique constraint that covers
  // this row is the PARTIAL index idx_journey_events_contact_optin_tracker
  // (WHERE contact_id IS NOT NULL …). PostgreSQL rejects an ON CONFLICT clause
  // that cannot be matched to a full unique constraint or index — error 42P10 —
  // so a plain upsert with onConflict on these columns silently fails.
  //
  // Duplicate protection is handled per-code below:
  //   23503 = FK violation → contact not yet in ghl_contacts → retry with null
  //   23505 = unique violation → duplicate tracker event → silently ignore
  const { error: journeyErr } = await supabase
    .from("journey_events")
    .insert(journeyRow);

  // Happy path — row inserted successfully.
  if (journeyErr === null) return;

  // 23505 = unique_violation: duplicate for an existing contact (partial index
  // idx_journey_events_contact_optin_tracker fired). Keepalive + localStorage
  // replay can both land for the same session — expected, ignore.
  if (journeyErr.code === "23505") return;

  // 23503 = foreign_key_violation: contact not yet in ghl_contacts (tracker
  // fires before GHL's webhook creates the record). Retry with contact_id = null
  // so the optin is still counted with full Meta attribution. The ghl_contact_id
  // is preserved in the payload for future reconciliation.
  if (journeyErr.code === "23503") {
    const pendingRow: JourneyInsert = {
      ...journeyRow,
      contact_id: null,
      payload: buildJourneyPayload(ev, { ghl_contact_id: contactId }),
    };
    const { error: retryErr } = await supabase
      .from("journey_events")
      .insert(pendingRow);

    // 23505 = duplicate null-contact row (idx_journey_events_optin_tracker_pending
    // fired). Replay arrived after the keepalive already landed — ignore.
    if (retryErr !== null && retryErr.code !== "23505") {
      console.error(
        `track API journey_events fallback insert failed for contact=${contactId}:`,
        retryErr.message
      );
    }
    return;
  }

  console.error(
    `track API journey_events insert failed for contact=${contactId}:`,
    journeyErr.message
  );
}

/**
 * Collector for the first-party tracking pixel. Accepts a batch of events,
 * verifies the project id, inserts `page_events` rows synchronously, and
 * bridges any `optin` events with a known GHL contact ID into `journey_events`
 * so they are visible in the Ads Manager lead counts.
 *
 * The insert is performed synchronously (before the 200 response) because the
 * previous `after()` implementation caused silent failures: the serverless
 * function was terminated by the platform before the deferred callback could
 * complete, which meant rows never reached the database despite the browser
 * receiving a 200 OK.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const raw = await parseBodyJson(request);
  const validated = validateTrackBody(raw);
  if (!validated.ok) return validated.response;

  const {
    site_id: siteId,
    session_id: sessionId,
    events,
    acceptedCount,
  } = validated.data;

  const { data: projectRow, error: projectError } = await supabase
    .from("projects")
    .select("id")
    .eq("id", siteId)
    .maybeSingle();

  if (projectError !== null) {
    console.error("track API project lookup failed:", projectError.message);
    return NextResponse.json(
      { success: false, error: "Database error" },
      { status: 500, headers: corsHeaders() }
    );
  }

  if (projectRow === null) {
    return NextResponse.json(
      {
        success: true,
        ignored: true,
        reason: "unknown_project",
      },
      { status: 200, headers: corsHeaders() }
    );
  }

  // Build page_events rows for all accepted, known event types.
  const rows: PageEventInsert[] = [];
  for (const ev of events) {
    const row = mapEventToInsert(siteId, sessionId, ev);
    if (row !== null) rows.push(row);
  }

  if (rows.length > 0) {
    const { error: insertError } = await supabase.from("page_events").insert(rows);
    if (insertError !== null) {
      console.error("track API page_events insert failed:", insertError.message);
    }
  }

  // Bridge optin events with a known GHL contact ID into journey_events so
  // the Ads Manager dashboard can count first-party leads via the tracker.
  const optinEvents = events.filter(
    (ev) =>
      ev.event_type === "optin" &&
      typeof ev.ghl_contact_id === "string" &&
      ev.ghl_contact_id.trim() !== ""
  );

  if (optinEvents.length > 0) {
    const integrationAccountIds = await loadIntegrationAccountIdsForProject(supabase, siteId);

    for (const ev of optinEvents) {
      const contactId = (ev.ghl_contact_id as string).trim();

      const attribution = integrationAccountIds.length > 0
        ? await resolveMetaAttributionFromUtm(supabase, {
            utmSource: ev.utm_source ?? "",
            utmContent: ev.utm_content ?? "",
            utmCampaign: ev.utm_campaign ?? "",
            integrationAccountIds,
          })
        : {
            meta_ad_id: null,
            meta_adset_id: null,
            meta_campaign_id: null,
            method: null,
          };

      await upsertTrackerJourneyEvent(ev, contactId, siteId, attribution);
    }
  }

  return NextResponse.json(
    { success: true, accepted: acceptedCount },
    {
      status: 200,
      headers: corsHeaders(),
    }
  );
}
