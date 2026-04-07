/**
 * Syncs GHL contacts into normalized tables (docs/database/migrations/003_ghl_contact_tables.sql).
 * No staging table: list + detail API → ghl_contacts + child tables; full detail body in raw_json.
 *
 * Env (node --env-file=.env):
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *   GHL_PRIVATE_INTEGRATION_TOKEN, GHL_LOCATION_ID
 * Optional: GHL_API_VERSION_CONTACTS (default 2021-07-28), GHL_THROTTLE_MS (default 80),
 *   GHL_DETAIL_CONCURRENCY (default 8, max 32) — parallel GET /contacts/{id} per list page
 *   GHL_RATE_LIMIT_RETRIES (default 6), GHL_RATE_LIMIT_BACKOFF_MS (default 800)
 *
 * Flags: --max-contacts=N, --resume (uses ghl_sync_cursors), --contact-id=ID (single contact; used by server webhook)
 *
 * List pagination: uses recommended `POST /contacts/search` (Get Contacts is deprecated in GHL docs).
 * Search traversal uses `page` + `pageLimit` for compatibility with current API validation.
 * Logs `Synced N` = detail fetches completed, not “new unique rows only.”
 */
import { createClient } from "@supabase/supabase-js";

const BASE = "https://services.leadconnectorhq.com";
const PAGE_LIMIT = 100;

/** Max rows per Supabase insert to stay under PostgREST limits */
const SUPABASE_INSERT_CHUNK = 500;

/** @type {ReadonlySet<string>} */
const CONTACT_KEYS_IN_COLUMNS_OR_CHILDREN = new Set([
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

/** @type {ReadonlySet<string>} */
const ATTRIBUTION_KNOWN_KEYS = new Set([
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

/**
 * @param {unknown} v
 * @returns {v is Record<string, unknown>}
 */
function isRecord(v) {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Optional `meta` cursor from GET /contacts/ (for diagnostics only; not used as
 * the next request’s `startAfterId` because it can differ from what the query accepts).
 *
 * @param {unknown} listBody Parsed JSON from GET /contacts/
 * @returns {string | null}
 */
function metaStartAfterHint(listBody) {
  if (!isRecord(listBody)) {
    return null;
  }
  const meta = isRecord(listBody.meta) ? listBody.meta : null;
  if (!meta) {
    return null;
  }
  const fromId = meta.startAfterId;
  if (typeof fromId === "string" && fromId.length > 0) {
    return fromId;
  }
  const fromAfter = meta.startAfter;
  if (typeof fromAfter === "string" && fromAfter.length > 0) {
    return fromAfter;
  }
  return null;
}

/**
 * @param {unknown[]} batch
 * @returns {string | null}
 */
function firstContactIdInBatch(batch) {
  for (const raw of batch) {
    if (isRecord(raw) && typeof raw.id === "string" && raw.id.length > 0) {
      return raw.id;
    }
  }
  return null;
}

/**
 * @param {unknown[]} batch
 * @returns {string | null}
 */
function lastContactIdInBatch(batch) {
  for (let i = batch.length - 1; i >= 0; i -= 1) {
    const raw = batch[i];
    if (isRecord(raw) && typeof raw.id === "string" && raw.id.length > 0) {
      return raw.id;
    }
  }
  return null;
}

/**
 * @param {unknown} v
 * @returns {string | null}
 */
function parseIsoTimestamptz(v) {
  if (typeof v !== "string" || v.trim() === "") {
    return null;
  }
  const ms = Date.parse(v);
  if (Number.isNaN(ms)) {
    return null;
  }
  return new Date(ms).toISOString();
}

/**
 * @param {unknown} v
 * @returns {string | null}
 */
function parseDateOnly(v) {
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

/**
 * @param {string} name
 * @param {string | undefined} v
 * @returns {string}
 */
function requireEnv(name, v) {
  if (!v || v === "") {
    throw new Error(`Missing required env: ${name}`);
  }
  return v;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function throttleMsFromEnv() {
  const raw = process.env.GHL_THROTTLE_MS;
  const n = raw !== undefined && raw !== "" ? parseInt(raw, 10) : 80;
  if (!Number.isFinite(n) || n < 0) {
    return 80;
  }
  return n;
}

/**
 * Parallel detail fetches per list page (each call still uses GHL_THROTTLE_MS before HTTP).
 *
 * @returns {number}
 */
function detailConcurrencyFromEnv() {
  const raw = process.env.GHL_DETAIL_CONCURRENCY;
  const n = raw !== undefined && raw !== "" ? parseInt(raw, 10) : 8;
  if (!Number.isFinite(n) || n < 1) {
    return 8;
  }
  return Math.min(n, 32);
}

/**
 * Retries for HTTP 429 from GHL.
 *
 * @returns {number}
 */
function rateLimitRetriesFromEnv() {
  const raw = process.env.GHL_RATE_LIMIT_RETRIES;
  const n = raw !== undefined && raw !== "" ? parseInt(raw, 10) : 6;
  if (!Number.isFinite(n) || n < 0) {
    return 6;
  }
  return Math.min(n, 20);
}

/**
 * Base exponential backoff for HTTP 429.
 *
 * @returns {number}
 */
function rateLimitBackoffMsFromEnv() {
  const raw = process.env.GHL_RATE_LIMIT_BACKOFF_MS;
  const n = raw !== undefined && raw !== "" ? parseInt(raw, 10) : 800;
  if (!Number.isFinite(n) || n < 50) {
    return 800;
  }
  return n;
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {string} table
 * @param {Record<string, unknown>[]} rows
 */
async function insertInChunks(supabase, table, rows) {
  if (rows.length === 0) {
    return;
  }
  for (let i = 0; i < rows.length; i += SUPABASE_INSERT_CHUNK) {
    const slice = rows.slice(i, i + SUPABASE_INSERT_CHUNK);
    const { error } = await supabase.from(table).insert(slice);
    if (error) {
      throw error;
    }
  }
}

function parseArgs() {
  /** @type {{ maxContacts: string; resume: boolean; contactId: string }} */
  const out = { maxContacts: "", resume: false, contactId: "" };
  for (const a of process.argv.slice(2)) {
    if (a === "--resume") {
      out.resume = true;
    } else if (a.startsWith("--max-contacts=")) {
      out.maxContacts = a.slice("--max-contacts=".length);
    } else if (a.startsWith("--contact-id=")) {
      out.contactId = a.slice("--contact-id=".length);
    }
  }
  return out;
}

/**
 * @param {Record<string, unknown>} inner
 */
function buildTopLevelExtras(inner) {
  /** @type {Record<string, unknown>} */
  const out = {};
  for (const key of Object.keys(inner)) {
    if (!CONTACT_KEYS_IN_COLUMNS_OR_CHILDREN.has(key)) {
      out[key] = inner[key];
    }
  }
  return out;
}

/**
 * GHL often returns attribution as `attributionSource` / `lastAttributionSource` objects on the
 * contact, while `attributions` is absent or empty. We persist those as child rows when the array
 * has no usable entries.
 *
 * @param {Record<string, unknown>} inner Parsed inner `contact` object from GET /contacts/{id}.
 * @returns {Record<string, unknown>[]}
 */
function collectAttributionPayloads(inner) {
  const rawList = Array.isArray(inner.attributions) ? inner.attributions : [];
  /** @type {Record<string, unknown>[] } */
  const fromArray = [];
  for (const item of rawList) {
    if (isRecord(item)) {
      fromArray.push(item);
    }
  }
  if (fromArray.length > 0) {
    return fromArray;
  }

  /** @type {Record<string, unknown>[] } */
  const fromObjects = [];
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

/**
 * JSON-serialize the GET /contacts/{id} body for Postgres jsonb (drops non-JSON types).
 *
 * @param {unknown} detail
 * @returns {Record<string, unknown>}
 */
function detailBodyAsJsonb(detail) {
  if (!isRecord(detail)) {
    return {};
  }
  try {
    const encoded = JSON.stringify(detail);
    const parsed = /** @type {unknown} */ (JSON.parse(encoded));
    if (isRecord(parsed)) {
      return parsed;
    }
    return {};
  } catch {
    return {};
  }
}

/**
 * @param {unknown} detail Full GET /contacts/{id} parsed JSON (contact + envelope keys).
 * @param {string} locationId
 */
function buildGhlContactRow(detail, locationId) {
  const inner =
    isRecord(detail) && isRecord(detail.contact)
      ? /** @type {Record<string, unknown>} */ (detail.contact)
      : isRecord(detail)
        ? detail
        : {};

  const id = typeof inner.id === "string" ? inner.id : "";
  if (!id) {
    throw new Error("GHL contact payload missing id");
  }

  const loc =
    typeof inner.locationId === "string" ? inner.locationId : locationId;

  const traceId =
    isRecord(detail) && typeof detail.traceId === "string"
      ? detail.traceId
      : null;

  const dndSettings =
    isRecord(inner.dndSettings) ? inner.dndSettings : {};

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
    dnd_settings: dndSettings,
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

/**
 * @param {unknown} att
 * @param {number} position
 * @param {string} contactId
 * @param {string} locationId
 */
function buildAttributionRow(att, position, contactId, locationId) {
  if (!isRecord(att)) {
    return null;
  }
  /** @type {Record<string, unknown>} */
  const extras = {};
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
    utm_content:
      typeof att.utmContent === "string" ? att.utmContent : null,
    fbclid: typeof att.fbclid === "string" ? att.fbclid : null,
    fbc: typeof att.fbc === "string" ? att.fbc : null,
    fbp: typeof att.fbp === "string" ? att.fbp : null,
    attribution_extras: extras,
    synced_at: new Date().toISOString(),
  };
}

/**
 * @param {unknown} cf
 */
function buildCustomFieldRow(cf) {
  if (!isRecord(cf)) {
    return null;
  }
  const fieldId = typeof cf.id === "string" ? cf.id : "";
  if (!fieldId) {
    return null;
  }
  let valueText = null;
  if (typeof cf.value === "string") {
    valueText = cf.value;
  } else if (typeof cf.fieldValue === "string") {
    valueText = cf.fieldValue;
  } else if (cf.value !== undefined && cf.value !== null) {
    valueText = JSON.stringify(cf.value);
  }
  return { field_id: fieldId, field_value: valueText };
}

/**
 * Replace child-table rows for many contacts: one delete per table (IN list) + chunked inserts.
 *
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {{ contactId: string; locationId: string; inner: Record<string, unknown> }[]} items
 * @param {string} now ISO timestamp shared by rows in this flush
 */
async function replaceContactChildrenBatch(supabase, items, now) {
  const ids = items.map((x) => x.contactId);
  if (ids.length === 0) {
    return;
  }

  await supabase.from("ghl_contact_tags").delete().in("contact_id", ids);
  await supabase
    .from("ghl_contact_custom_field_values")
    .delete()
    .in("contact_id", ids);
  await supabase
    .from("ghl_contact_attributions")
    .delete()
    .in("contact_id", ids);
  await supabase
    .from("ghl_contact_additional_emails")
    .delete()
    .in("contact_id", ids);
  await supabase
    .from("ghl_contact_followers")
    .delete()
    .in("contact_id", ids);

  /** @type {Record<string, unknown>[]} */
  const tagRows = [];
  /** @type {Record<string, unknown>[]} */
  const cfRows = [];
  /** @type {Record<string, unknown>[]} */
  const attRows = [];
  /** @type {Record<string, unknown>[]} */
  const emailRows = [];
  /** @type {Record<string, unknown>[]} */
  const folRows = [];

  for (const it of items) {
    const { contactId, locationId, inner } = it;

    const tags = Array.isArray(inner.tags) ? inner.tags : [];
    for (const t of tags) {
      if (typeof t === "string" && t.length > 0) {
        tagRows.push({
          contact_id: contactId,
          location_id: locationId,
          tag_name: t,
          synced_at: now,
        });
      }
    }

    const cfs = Array.isArray(inner.customFields) ? inner.customFields : [];
    for (const cf of cfs) {
      const row = buildCustomFieldRow(cf);
      if (row) {
        cfRows.push({
          contact_id: contactId,
          location_id: locationId,
          field_id: row.field_id,
          field_value: row.field_value,
          synced_at: now,
        });
      }
    }

    const atts = collectAttributionPayloads(inner);
    let pos = 0;
    for (const a of atts) {
      const row = buildAttributionRow(a, pos, contactId, locationId);
      if (row) {
        attRows.push(row);
        pos += 1;
      }
    }

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
  }

  await insertInChunks(supabase, "ghl_contact_tags", tagRows);
  await insertInChunks(supabase, "ghl_contact_custom_field_values", cfRows);
  await insertInChunks(supabase, "ghl_contact_attributions", attRows);
  await insertInChunks(supabase, "ghl_contact_additional_emails", emailRows);
  await insertInChunks(supabase, "ghl_contact_followers", folRows);
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {string} contactId
 * @param {string} locationId
 * @param {Record<string, unknown>} inner
 */
async function replaceContactChildren(supabase, contactId, locationId, inner) {
  const now = new Date().toISOString();
  await replaceContactChildrenBatch(
    supabase,
    [{ contactId, locationId, inner }],
    now
  );
}

/**
 * Upsert many `ghl_contacts` rows and replace child tables in one flush (list-page batch).
 *
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {{ id: string; detail: unknown }[]} pairs
 * @param {string} locationId
 * @param {{ updateCursor: boolean; cursorLocationId: string }} cursorOpts
 * @returns {Promise<number>} Number of contacts written
 */
async function flushContactsFromDetails(
  supabase,
  pairs,
  locationId,
  cursorOpts
) {
  const now = new Date().toISOString();
  /** @type {ReturnType<typeof buildGhlContactRow>[]} */
  const contactRows = [];
  /** @type {{ contactId: string; locationId: string; inner: Record<string, unknown> }[]} */
  const childItems = [];

  for (const { id, detail } of pairs) {
    try {
      const row = buildGhlContactRow(detail, locationId);
      contactRows.push(row);
      const inner =
        isRecord(detail) && isRecord(detail.contact)
          ? /** @type {Record<string, unknown>} */ (detail.contact)
          : isRecord(detail)
            ? detail
            : {};
      childItems.push({
        contactId: row.id,
        locationId: row.location_id,
        inner,
      });
    } catch (e) {
      console.error(`Skip contact ${id} (invalid payload):`, e);
    }
  }

  if (contactRows.length === 0) {
    return 0;
  }

  const { error: upErr } = await supabase
    .from("ghl_contacts")
    .upsert(contactRows, { onConflict: "id" });
  if (upErr) {
    throw upErr;
  }

  await replaceContactChildrenBatch(supabase, childItems, now);

  if (cursorOpts.updateCursor) {
    // Page cursor is persisted by the caller after a successful list page flush.
  }

  return contactRows.length;
}

/**
 * Upsert one contact row and replace child tables from a GET /contacts/{id} body.
 *
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {unknown} detail
 * @param {string} locationId
 * @param {{ updateCursor: boolean; cursorLocationId: string }} cursorOpts
 */
async function upsertContactPipeline(supabase, detail, locationId, cursorOpts) {
  const inner =
    isRecord(detail) && isRecord(detail.contact)
      ? /** @type {Record<string, unknown>} */ (detail.contact)
      : isRecord(detail)
        ? detail
        : {};
  const cid = typeof inner.id === "string" ? inner.id : "";
  if (!cid) {
    throw new Error("GHL contact payload missing id");
  }
  const n = await flushContactsFromDetails(
    supabase,
    [{ id: cid, detail }],
    locationId,
    cursorOpts
  );
  if (n !== 1) {
    throw new Error("Expected one contact written");
  }
}

async function main() {
  const args = parseArgs();
  const maxContacts = args.maxContacts
    ? parseInt(String(args.maxContacts), 10)
    : Number.POSITIVE_INFINITY;
  const throttleMs = throttleMsFromEnv();

  const supabaseUrl = requireEnv("SUPABASE_URL", process.env.SUPABASE_URL);
  const supabaseKey = requireEnv(
    "SUPABASE_SERVICE_ROLE_KEY",
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
  const ghlToken = requireEnv(
    "GHL_PRIVATE_INTEGRATION_TOKEN",
    process.env.GHL_PRIVATE_INTEGRATION_TOKEN
  );
  const locationId = requireEnv("GHL_LOCATION_ID", process.env.GHL_LOCATION_ID);
  const verContacts =
    process.env.GHL_API_VERSION_CONTACTS ?? "2021-07-28";
  const rateLimitRetries = rateLimitRetriesFromEnv();
  const rateLimitBackoffMs = rateLimitBackoffMsFromEnv();

  const supabase = createClient(supabaseUrl, supabaseKey);

  /**
   * Shared HTTP request with retry for 429.
   *
   * @param {"GET" | "POST"} method
   * @param {string} path
   * @param {Record<string, unknown> | null} jsonBody
   * @returns {Promise<unknown>}
   */
  async function ghlRequest(method, path, jsonBody) {
    const url = `${BASE}${path.startsWith("/") ? "" : "/"}${path}`;
    for (let attempt = 0; attempt <= rateLimitRetries; attempt += 1) {
      await sleep(throttleMs);
      /** @type {Record<string, string>} */
      const headers = {
        Authorization: `Bearer ${ghlToken}`,
        Accept: "application/json",
        Version: verContacts,
      };
      if (jsonBody !== null) {
        headers["Content-Type"] = "application/json";
      }
      const res = await fetch(url, {
        method,
        headers,
        body: jsonBody !== null ? JSON.stringify(jsonBody) : undefined,
      });
      const text = await res.text();
      /** @type {unknown} */
      let body;
      try {
        body = JSON.parse(text);
      } catch {
        body = { _raw: text };
      }
      if (res.ok) {
        return body;
      }

      if (res.status === 429 && attempt < rateLimitRetries) {
        const retryAfterHeader = res.headers.get("retry-after");
        const retryAfterSeconds = retryAfterHeader
          ? parseInt(retryAfterHeader, 10)
          : 0;
        const retryAfterMs =
          Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
            ? retryAfterSeconds * 1000
            : 0;
        const backoff = rateLimitBackoffMs * Math.pow(2, attempt);
        const jitter = Math.floor(Math.random() * 250);
        const waitMs = Math.max(backoff + jitter, retryAfterMs);
        console.warn(
          `GHL 429 for ${method} ${path}; retry ${attempt + 1}/${rateLimitRetries} in ${waitMs}ms`
        );
        await sleep(waitMs);
        continue;
      }

      const preview =
        typeof body === "object" && body !== null
          ? JSON.stringify(body).slice(0, 800)
          : String(body);
      throw new Error(`GHL ${res.status} ${url} — ${preview}`);
    }
    throw new Error(`GHL 429 exhausted retries for ${url}`);
  }

  /**
   * @param {string} pathWithQuery
   */
  async function ghlGet(pathWithQuery) {
    return ghlRequest("GET", pathWithQuery, null);
  }

  /**
   * @param {string} path
   * @param {Record<string, unknown>} body
   */
  async function ghlPost(path, body) {
    return ghlRequest("POST", path, body);
  }

  const singleId = args.contactId.trim();
  if (singleId !== "") {
    try {
      /** @type {unknown} */
      const detail = await ghlGet(
        `/contacts/${encodeURIComponent(singleId)}`
      );
      await upsertContactPipeline(supabase, detail, locationId, {
        updateCursor: false,
        cursorLocationId: locationId,
      });
      console.log(`Done. Single contact synced: ${singleId}`);
    } catch (e) {
      console.error(e);
      process.exit(1);
    }
    return;
  }

  let page = 1;
  if (args.resume) {
    const { data: cur, error: curErr } = await supabase
      .from("ghl_sync_cursors")
      .select("contacts_start_after_id")
      .eq("location_id", locationId)
      .maybeSingle();
    if (curErr) {
      console.warn("Resume: could not read ghl_sync_cursors:", curErr.message);
    } else if (
      cur &&
      typeof cur.contacts_start_after_id === "string" &&
      cur.contacts_start_after_id.length > 0
    ) {
      const parsedPage = parseInt(cur.contacts_start_after_id, 10);
      if (Number.isFinite(parsedPage) && parsedPage >= 1) {
        page = parsedPage;
      }
      console.log(`Resume: search page=${page}`);
    }
  }

  let processed = 0;
  /** @type {string} */
  let previousListFirstContactId = "";
  let repeatedPageGuardCount = 0;
  const detailConcurrency = detailConcurrencyFromEnv();
  console.log(
    `GHL contact sync → normalized tables (throttle ${throttleMs}ms, detail concurrency ${detailConcurrency})`
  );

  while (processed < maxContacts) {
    /** @type {Record<string, unknown>} */
    const searchPayload = {
      locationId,
      page,
      pageLimit: PAGE_LIMIT,
    };

    /** @type {unknown} */
    let listBody;
    try {
      listBody = await ghlPost("/contacts/search", searchPayload);
    } catch (e) {
      console.error("Contact list failed:", e);
      process.exit(1);
    }

    const contacts = isRecord(listBody) ? listBody.contacts : null;
    const batch = Array.isArray(contacts) ? contacts : [];
    if (batch.length === 0) {
      console.log("Contact list: no more rows.");
      if (args.resume) {
        await supabase.from("ghl_sync_cursors").upsert(
          {
            location_id: locationId,
            contacts_start_after_id: null,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "location_id" }
        );
      }
      break;
    }

    const firstInBatch = firstContactIdInBatch(batch);
    if (
      page > 1 &&
      firstInBatch !== null &&
      previousListFirstContactId !== "" &&
      firstInBatch === previousListFirstContactId
    ) {
      repeatedPageGuardCount += 1;
      if (repeatedPageGuardCount <= 2) {
        page += 1;
        console.warn(
          `Repeated page detected; skipping ahead to search page ${page} (attempt ${repeatedPageGuardCount}/2).`
        );
        continue;
      }
      console.error(
        "Contact list repeated after cursor advance. Stopping to avoid infinite loop (check location id/token scope/API behavior)."
      );
      process.exit(1);
    }
    repeatedPageGuardCount = 0;
    if (firstInBatch !== null) {
      previousListFirstContactId = firstInBatch;
    }

    /** @type {boolean} */
    let completedFullBatch = true;
    /** @type {string[]} */
    const contactIds = [];
    for (const raw of batch) {
      if (processed + contactIds.length >= maxContacts) {
        completedFullBatch = false;
        break;
      }
      if (!isRecord(raw) || typeof raw.id !== "string") {
        continue;
      }
      contactIds.push(raw.id);
    }

    /** @type {{ id: string; detail: unknown }[]} */
    const detailPairs = [];
    for (let c = 0; c < contactIds.length; c += detailConcurrency) {
      const slice = contactIds.slice(c, c + detailConcurrency);
      const chunkResults = await Promise.all(
        slice.map(async (id) => {
          try {
            /** @type {unknown} */
            const detail = await ghlGet(
              `/contacts/${encodeURIComponent(id)}`
            );
            return { id, detail };
          } catch (err) {
            console.error(`Failed contact ${id}:`, err);
            return null;
          }
        })
      );
      for (const item of chunkResults) {
        if (item !== null) {
          detailPairs.push(item);
        }
      }
    }

    if (detailPairs.length > 0) {
      try {
        const written = await flushContactsFromDetails(
          supabase,
          detailPairs,
          locationId,
          {
            updateCursor: args.resume,
            cursorLocationId: locationId,
          }
        );
        processed += written;
        console.log(
          `Synced list page: +${written} contacts (running total ${processed})`
        );
      } catch (err) {
        console.error("Batch upsert failed:", err);
      }
    }

    if (batch.length < PAGE_LIMIT) {
      if (args.resume) {
        await supabase.from("ghl_sync_cursors").upsert(
          {
            location_id: locationId,
            contacts_start_after_id: null,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "location_id" }
        );
      }
      break;
    }

    if (!completedFullBatch) {
      break;
    }
    page += 1;
    if (args.resume) {
      await supabase.from("ghl_sync_cursors").upsert(
        {
          location_id: locationId,
          contacts_start_after_id: String(page),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "location_id" }
      );
    }
  }

  console.log(`Done. Contacts processed: ${processed}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
