/**
 * In-process mirror of one GHL contact into Supabase (same data shape as
 * `scripts/sync-ghl-contacts-to-supabase.mjs` single-contact upsert), without
 * spawning a subprocess — used for fast sheet imports.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/database.types";

type GhlContactInsert = Database["public"]["Tables"]["ghl_contacts"]["Insert"];

const CONTACT_KEYS_IN_COLUMNS_OR_CHILDREN = new Set<string>([
  "id",
  "locationId",
  "email",
  "phone",
  "contactName",
  "firstName",
  "lastName",
  "firstNameRaw",
  "lastNameRaw",
  "companyName",
  "source",
  "type",
  "assignedTo",
  "dnd",
  "dndSettings",
  "city",
  "state",
  "postalCode",
  "address1",
  "country",
  "website",
  "timezone",
  "dateAdded",
  "dateUpdated",
  "dateOfBirth",
  "businessId",
  "profilePhoto",
  "tags",
  "customFields",
  "attributions",
  "attributionSource",
  "lastAttributionSource",
  "additionalEmails",
  "followers",
]);

const ATTRIBUTION_KNOWN_KEYS = new Set<string>([
  "pageUrl",
  "referrer",
  "utmSessionSource",
  "sessionSource",
  "medium",
  "mediumId",
  "isFirst",
  "isLast",
  "ip",
  "userAgent",
  "url",
  "utmCampaign",
  "utmMedium",
  "utmSource",
  "utmTerm",
  "utmContent",
  "fbclid",
  "fbc",
  "fbp",
]);

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function parseIsoTimestamptz(v: unknown): string | null {
  if (typeof v !== "string" || v.trim() === "") {
    return null;
  }
  const ms = Date.parse(v);
  if (Number.isNaN(ms)) {
    return null;
  }
  return new Date(ms).toISOString();
}

function parseDateOnly(v: unknown): string | null {
  if (typeof v !== "string" || v.trim() === "") {
    return null;
  }
  const s = v.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    return s;
  }
  const ms = Date.parse(s);
  if (Number.isNaN(ms)) {
    return null;
  }
  return new Date(ms).toISOString().slice(0, 10);
}

function detailBodyAsJsonb(detail: unknown): Json {
  if (!isRecord(detail)) {
    return {};
  }
  try {
    const encoded = JSON.stringify(detail);
    const parsed = JSON.parse(encoded) as unknown;
    if (isRecord(parsed)) {
      return parsed as Json;
    }
    return {};
  } catch {
    return {};
  }
}

function buildTopLevelExtras(inner: Record<string, unknown>): Json {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(inner)) {
    if (!CONTACT_KEYS_IN_COLUMNS_OR_CHILDREN.has(key)) {
      out[key] = inner[key];
    }
  }
  return out as Json;
}

function collectAttributionPayloads(inner: Record<string, unknown>): Record<
  string,
  unknown
>[] {
  const rawList = Array.isArray(inner.attributions) ? inner.attributions : [];
  const fromArray: Record<string, unknown>[] = [];
  for (const item of rawList) {
    if (isRecord(item)) {
      fromArray.push(item);
    }
  }
  if (fromArray.length > 0) {
    return fromArray;
  }

  const fromObjects: Record<string, unknown>[] = [];
  if (isRecord(inner.attributionSource)) {
    fromObjects.push(inner.attributionSource);
  }
  if (isRecord(inner.lastAttributionSource)) {
    const last = inner.lastAttributionSource;
    const first = fromObjects[0];
    if (first === undefined) {
      fromObjects.push(last);
    } else {
      try {
        if (JSON.stringify(first) !== JSON.stringify(last)) {
          fromObjects.push(last);
        }
      } catch {
        fromObjects.push(last);
      }
    }
  }
  return fromObjects;
}

function buildCustomFieldRow(cf: unknown): {
  field_id: string;
  field_value: string | null;
} | null {
  if (!isRecord(cf)) {
    return null;
  }
  const fieldId = typeof cf.id === "string" ? cf.id : "";
  if (fieldId === "") {
    return null;
  }
  let valueText: string | null = null;
  if (typeof cf.value === "string") {
    valueText = cf.value;
  } else if (typeof cf.fieldValue === "string") {
    valueText = cf.fieldValue;
  } else if (cf.value !== undefined && cf.value !== null) {
    valueText = JSON.stringify(cf.value);
  }
  return { field_id: fieldId, field_value: valueText };
}

function buildAttributionRow(
  att: unknown,
  position: number,
  contactId: string,
  locationId: string
): Database["public"]["Tables"]["ghl_contact_attributions"]["Insert"] | null {
  if (!isRecord(att)) {
    return null;
  }
  const extras: Record<string, unknown> = {};
  for (const k of Object.keys(att)) {
    if (!ATTRIBUTION_KNOWN_KEYS.has(k)) {
      extras[k] = att[k];
    }
  }
  return {
    contact_id: contactId,
    location_id: locationId,
    position,
    page_url: typeof att.pageUrl === "string" ? att.pageUrl : null,
    referrer: typeof att.referrer === "string" ? att.referrer : null,
    utm_session_source:
      typeof att.utmSessionSource === "string"
        ? att.utmSessionSource
        : typeof att.sessionSource === "string"
          ? att.sessionSource
          : null,
    medium: typeof att.medium === "string" ? att.medium : null,
    medium_id: typeof att.mediumId === "string" ? att.mediumId : null,
    is_first: typeof att.isFirst === "boolean" ? att.isFirst : null,
    is_last: typeof att.isLast === "boolean" ? att.isLast : null,
    ip: typeof att.ip === "string" ? att.ip : null,
    user_agent: typeof att.userAgent === "string" ? att.userAgent : null,
    url: typeof att.url === "string" ? att.url : null,
    utm_campaign:
      typeof att.utmCampaign === "string" ? att.utmCampaign : null,
    utm_medium: typeof att.utmMedium === "string" ? att.utmMedium : null,
    utm_source: typeof att.utmSource === "string" ? att.utmSource : null,
    utm_term: typeof att.utmTerm === "string" ? att.utmTerm : null,
    utm_content: typeof att.utmContent === "string" ? att.utmContent : null,
    fbclid: typeof att.fbclid === "string" ? att.fbclid : null,
    fbc: typeof att.fbc === "string" ? att.fbc : null,
    fbp: typeof att.fbp === "string" ? att.fbp : null,
    attribution_extras: extras as Json,
    synced_at: new Date().toISOString(),
  };
}

function getInnerContact(detail: unknown): Record<string, unknown> {
  if (isRecord(detail) && isRecord(detail.contact)) {
    return detail.contact;
  }
  if (isRecord(detail)) {
    return detail;
  }
  return {};
}

function buildGhlContactRow(
  detail: unknown,
  locationId: string
): GhlContactInsert {
  const inner = getInnerContact(detail);
  const id = typeof inner.id === "string" ? inner.id : "";
  if (id === "") {
    throw new Error("GHL contact payload missing id");
  }
  const loc =
    typeof inner.locationId === "string" ? inner.locationId : locationId;
  const traceId =
    isRecord(detail) && typeof detail.traceId === "string"
      ? detail.traceId
      : null;
  const dndSettings = isRecord(inner.dndSettings) ? inner.dndSettings : {};

  return {
    id,
    location_id: loc,
    email: typeof inner.email === "string" ? inner.email : null,
    phone: typeof inner.phone === "string" ? inner.phone : null,
    contact_name:
      typeof inner.contactName === "string" ? inner.contactName : null,
    first_name: typeof inner.firstName === "string" ? inner.firstName : null,
    last_name: typeof inner.lastName === "string" ? inner.lastName : null,
    first_name_raw:
      typeof inner.firstNameRaw === "string" ? inner.firstNameRaw : null,
    last_name_raw:
      typeof inner.lastNameRaw === "string" ? inner.lastNameRaw : null,
    company_name:
      typeof inner.companyName === "string" ? inner.companyName : null,
    source: typeof inner.source === "string" ? inner.source : null,
    type: typeof inner.type === "string" ? inner.type : null,
    assigned_to:
      typeof inner.assignedTo === "string" ? inner.assignedTo : null,
    dnd: typeof inner.dnd === "boolean" ? inner.dnd : null,
    dnd_settings: dndSettings as Json,
    city: typeof inner.city === "string" ? inner.city : null,
    state: typeof inner.state === "string" ? inner.state : null,
    postal_code:
      typeof inner.postalCode === "string" ? inner.postalCode : null,
    address1: typeof inner.address1 === "string" ? inner.address1 : null,
    country: typeof inner.country === "string" ? inner.country : null,
    website: typeof inner.website === "string" ? inner.website : null,
    timezone: typeof inner.timezone === "string" ? inner.timezone : null,
    date_added: parseIsoTimestamptz(inner.dateAdded),
    date_updated: parseIsoTimestamptz(inner.dateUpdated),
    date_of_birth: parseDateOnly(inner.dateOfBirth),
    business_id:
      typeof inner.businessId === "string" ? inner.businessId : null,
    profile_photo:
      typeof inner.profilePhoto === "string" ? inner.profilePhoto : null,
    trace_id: traceId,
    api_top_level_extras: buildTopLevelExtras(inner),
    raw_json: detailBodyAsJsonb(detail),
    synced_at: new Date().toISOString(),
  };
}

const INSERT_CHUNK = 500;

async function insertInChunks<T extends Record<string, unknown>>(
  supabase: SupabaseClient<Database>,
  table: "ghl_contact_tags" | "ghl_contact_custom_field_values" | "ghl_contact_attributions" | "ghl_contact_additional_emails" | "ghl_contact_followers",
  rows: T[]
): Promise<void> {
  for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
    const slice = rows.slice(i, i + INSERT_CHUNK);
    if (slice.length === 0) continue;
    const { error } = await supabase.from(table).insert(slice as never);
    if (error !== null) {
      throw new Error(`${table} insert: ${error.message}`);
    }
  }
}

async function replaceContactChildrenForOne(
  supabase: SupabaseClient<Database>,
  contactId: string,
  locationId: string,
  inner: Record<string, unknown>
): Promise<void> {
  const now = new Date().toISOString();

  await supabase.from("ghl_contact_tags").delete().eq("contact_id", contactId);
  await supabase
    .from("ghl_contact_custom_field_values")
    .delete()
    .eq("contact_id", contactId);
  await supabase
    .from("ghl_contact_attributions")
    .delete()
    .eq("contact_id", contactId);
  await supabase
    .from("ghl_contact_additional_emails")
    .delete()
    .eq("contact_id", contactId);
  await supabase
    .from("ghl_contact_followers")
    .delete()
    .eq("contact_id", contactId);

  const tagRows: Database["public"]["Tables"]["ghl_contact_tags"]["Insert"][] =
    [];
  /** GHL can repeat the same tag string; PK is (contact_id, tag_name). */
  const tagNamesSeen = new Set<string>();
  const tags = Array.isArray(inner.tags) ? inner.tags : [];
  for (const t of tags) {
    if (typeof t !== "string") {
      continue;
    }
    const tagName = t.trim();
    if (tagName === "" || tagNamesSeen.has(tagName)) {
      continue;
    }
    tagNamesSeen.add(tagName);
    tagRows.push({
      contact_id: contactId,
      location_id: locationId,
      tag_name: tagName,
      synced_at: now,
    });
  }

  const cfRows: Database["public"]["Tables"]["ghl_contact_custom_field_values"]["Insert"][] =
    [];
  const cfs = Array.isArray(inner.customFields) ? inner.customFields : [];
  for (const cf of cfs) {
    const row = buildCustomFieldRow(cf);
    if (row !== null) {
      cfRows.push({
        contact_id: contactId,
        location_id: locationId,
        field_id: row.field_id,
        field_value: row.field_value,
        synced_at: now,
      });
    }
  }

  const attRows: Database["public"]["Tables"]["ghl_contact_attributions"]["Insert"][] =
    [];
  const atts = collectAttributionPayloads(inner);
  let pos = 0;
  for (const a of atts) {
    const row = buildAttributionRow(a, pos, contactId, locationId);
    if (row !== null) {
      attRows.push(row);
      pos += 1;
    }
  }

  const emailRows: Database["public"]["Tables"]["ghl_contact_additional_emails"]["Insert"][] =
    [];
  const addEmails = Array.isArray(inner.additionalEmails)
    ? inner.additionalEmails
    : [];
  for (const e of addEmails) {
    if (typeof e === "string" && e.length > 0) {
      emailRows.push({
        contact_id: contactId,
        location_id: locationId,
        email: e,
        synced_at: now,
      });
    }
  }

  const folRows: Database["public"]["Tables"]["ghl_contact_followers"]["Insert"][] =
    [];
  const followers = Array.isArray(inner.followers) ? inner.followers : [];
  for (const f of followers) {
    if (typeof f === "string" && f.length > 0) {
      folRows.push({
        contact_id: contactId,
        location_id: locationId,
        follower_user_id: f,
        synced_at: now,
      });
    }
  }

  await insertInChunks(supabase, "ghl_contact_tags", tagRows);
  await insertInChunks(supabase, "ghl_contact_custom_field_values", cfRows);
  await insertInChunks(supabase, "ghl_contact_attributions", attRows);
  await insertInChunks(supabase, "ghl_contact_additional_emails", emailRows);
  await insertInChunks(supabase, "ghl_contact_followers", folRows);
}

/**
 * Upserts `ghl_contacts` and replaces child tables from a GET /contacts/:id JSON body.
 */
export async function mirrorGhlContactFromApiDetail(
  supabase: SupabaseClient<Database>,
  detail: unknown,
  locationId: string
): Promise<void> {
  const row = buildGhlContactRow(detail, locationId);
  const inner = getInnerContact(detail);

  /**
   * In-app Zoom-only contacts use ids prefixed `nmdapp-`; never overwrite from GHL API.
   */
  if (row.id.startsWith("nmdapp-")) {
    return;
  }

  const { error: upErr } = await supabase
    .from("ghl_contacts")
    .upsert(row, { onConflict: "id" });
  if (upErr !== null) {
    throw new Error(`ghl_contacts upsert: ${upErr.message}`);
  }

  await replaceContactChildrenForOne(supabase, row.id, row.location_id, inner);
}
