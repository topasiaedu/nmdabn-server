import { supabase } from "@/config/supabase";
import type { Database, Json } from "@/database.types";
import {
  loadIntegrationAccountIdsForProject,
  resolveMetaAttributionFromUtm,
} from "@/services/optin-meta-attribution";

/**
 * Normalized first-touch attribution fields stored under `raw_json.contact.attributionSource`.
 */
interface AttributionSource {
  utmSource: string;
  utmMedium: string;
  utmCampaign: string;
  utmContent: string;
  utmTerm: string;
}

/**
 * Returns true when `v` is a plain object record (not array).
 */
function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Returns true when `v` is an ISO datetime string that parses to a finite instant.
 */
function isIsoDateString(v: unknown): v is string {
  if (typeof v !== "string" || v.trim() === "") return false;
  const ms = new Date(v).getTime();
  return Number.isFinite(ms);
}

/**
 * Reads `utm*` fields from `raw_json.contact.attributionSource`.
 *
 * @param rawJson Mirrored GHL contact payload (`ghl_contacts.raw_json`).
 * @returns All fields as trimmed strings (empty string when absent).
 */
function extractAttributionSource(rawJson: Json): AttributionSource {
  const empty: AttributionSource = {
    utmSource: "",
    utmMedium: "",
    utmCampaign: "",
    utmContent: "",
    utmTerm: "",
  };
  if (!isRecord(rawJson)) return empty;
  const contactVal = rawJson.contact;
  if (!isRecord(contactVal)) return empty;
  const srcVal = contactVal.attributionSource;
  if (!isRecord(srcVal)) return empty;

  const str = (x: unknown): string => (typeof x === "string" ? x : "");

  return {
    utmSource: str(srcVal.utmSource),
    utmMedium: str(srcVal.utmMedium),
    utmCampaign: str(srcVal.utmCampaign),
    utmContent: str(srcVal.utmContent),
    utmTerm: str(srcVal.utmTerm),
  };
}

/**
 * Prefers `raw_json.contact.dateAdded` when valid ISO; otherwise current time.
 */
function resolveOccurredAt(rawJson: Json): string {
  if (!isRecord(rawJson)) return new Date().toISOString();
  const contactVal = rawJson.contact;
  if (!isRecord(contactVal)) return new Date().toISOString();
  const dateAdded = contactVal.dateAdded;
  if (typeof dateAdded === "string" && isIsoDateString(dateAdded)) {
    return dateAdded;
  }
  return new Date().toISOString();
}

/**
 * Loads `projects.id` for a GHL location id (`ghl_contacts.location_id`).
 */
async function resolveProjectIdForLocation(
  locationId: string
): Promise<string | null> {
  const { data: row, error } = await supabase
    .from("projects")
    .select("id")
    .eq("ghl_location_id", locationId)
    .maybeSingle();

  if (error !== null) {
    console.error(
      `createOptinJourneyEventForContact: project lookup failed for location "${locationId}":`,
      error.message
    );
    return null;
  }
  return row?.id ?? null;
}

/**
 * After `ContactCreate` webhook sync, inserts or updates a single `journey_events`
 * row (`event_type = optin`, `source_system = ghl_webhook`) keyed by contact id so
 * duplicate webhook deliveries remain idempotent.
 *
 * Location → project mapping follows {@link resolveProjectIdForLocation} (same as
 * the custom opt-in webhook).
 *
 * @param contactId GHL contact id (`ghl_contacts.id`).
 */
export async function createOptinJourneyEventForContact(
  contactId: string
): Promise<void> {
  const { data: contactRow, error: contactErr } = await supabase
    .from("ghl_contacts")
    .select("id, location_id, raw_json")
    .eq("id", contactId)
    .maybeSingle();

  if (contactErr !== null) {
    console.error(
      `createOptinJourneyEventForContact: failed to load contact "${contactId}":`,
      contactErr.message
    );
    return;
  }

  if (contactRow === null) {
    console.warn(
      `createOptinJourneyEventForContact: contact "${contactId}" not found`
    );
    return;
  }

  const locationId = contactRow.location_id;
  const projectId = await resolveProjectIdForLocation(locationId);

  if (projectId === null) {
    console.warn(
      `createOptinJourneyEventForContact: no project for location "${locationId}" (contact "${contactId}")`
    );
    return;
  }

  const attribution = extractAttributionSource(contactRow.raw_json);
  const occurredAt = resolveOccurredAt(contactRow.raw_json);

  const integrationAccountIds = await loadIntegrationAccountIdsForProject(
    supabase,
    projectId
  );

  const metaAttribution = await resolveMetaAttributionFromUtm(supabase, {
    utmSource: attribution.utmSource,
    utmContent: attribution.utmContent,
    utmCampaign: attribution.utmCampaign,
    integrationAccountIds,
  });

  type JourneyInsert = Database["public"]["Tables"]["journey_events"]["Insert"];

  const row: JourneyInsert = {
    contact_id: contactId,
    event_type: "optin",
    source_system: "ghl_webhook",
    project_id: projectId,
    location_id: locationId,
    occurred_at: occurredAt,
    payload: {},
    webinar_run_id: null,
    duration_seconds: null,
    meta_ad_id: metaAttribution.meta_ad_id,
    meta_adset_id: metaAttribution.meta_adset_id,
    meta_campaign_id: metaAttribution.meta_campaign_id,
    meta_attribution_method: metaAttribution.method,
  };

  const { error: upsertErr } = await supabase.from("journey_events").upsert(row, {
    onConflict: "contact_id,event_type,source_system",
  });

  if (upsertErr !== null) {
    console.error(
      `createOptinJourneyEventForContact: upsert failed for "${contactId}":`,
      upsertErr.message
    );
  }
}
