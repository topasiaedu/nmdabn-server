# Custom Tracking Pixel — Agent Implementation Prompts

**Date:** 2026-04-22
**Usage:** Pass each prompt below to a fresh Gemini agent instance. Run Agent 1 first (it creates the DB migration and types that Agent 2 and 3 depend on for context), but Agent 2 and Agent 3 can run in parallel after Agent 1 finishes.

---

## Agent 1 — Database migration, database types, collector API

### Prompt

You are implementing the backend infrastructure for a custom first-party tracking pixel in a Next.js 15 (App Router) project with Supabase/Postgres.

**Project tech stack:**
- Next.js 15 App Router, TypeScript strict mode, deployed on Vercel
- Supabase JS client (`@supabase/supabase-js`) for all DB access
- `src/database.types.ts` contains generated Supabase types (Database interface)
- `supabase` client imported from `@/config/supabase`
- `after` from `next/server` used to defer background work after HTTP response

**TypeScript rules (CRITICAL — do not violate):**
- No `any` type
- No non-null assertion operator (`!`)
- No `as unknown as T` casts
- Double quotes for all strings
- Template literals instead of string concatenation
- Full JSDoc comments on all exported functions and types

---

### Task 1 of 3 — Create `docs/database/migrations/033_page_events.sql`

This file follows the same pattern as earlier migrations in `docs/database/migrations/`. Here is migration 032 as a format reference:

```sql
-- Migration 032: Add resolved Meta entity ID columns to journey_events.
ALTER TABLE public.journey_events
    ADD COLUMN IF NOT EXISTS meta_adset_id     TEXT,
    ADD COLUMN IF NOT EXISTS meta_campaign_id  TEXT,
    ADD COLUMN IF NOT EXISTS meta_ad_id        TEXT,
    ADD COLUMN IF NOT EXISTS meta_attribution_method TEXT
        CHECK (meta_attribution_method IN ('ad_id', 'name_match'));

CREATE INDEX IF NOT EXISTS idx_journey_events_meta_adset_id
    ON public.journey_events (meta_adset_id)
    WHERE meta_adset_id IS NOT NULL;
```

Create `docs/database/migrations/033_page_events.sql` with:

```
-- Migration 033: First-party page event tracking table.
```

Table `public.page_events`:
- `id UUID DEFAULT gen_random_uuid() PRIMARY KEY`
- `project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE`
- `session_id TEXT NOT NULL` — browser-generated UUID stored in localStorage
- `ghl_contact_id TEXT` — GHL contact id, populated when visitor submits a form
- `event_type TEXT NOT NULL` — one of: `pageview`, `click`, `scroll_depth`, `optin`, `mousemove`
- `url TEXT`
- `referrer TEXT`
- `utm_source TEXT`, `utm_medium TEXT`, `utm_campaign TEXT`, `utm_content TEXT`, `utm_term TEXT`
- `fbclid TEXT` — Facebook click ID from URL if present
- `scroll_depth SMALLINT` — 0–100, populated on scroll_depth events
- `x SMALLINT` — viewport-percentage X coordinate (click / mousemove events)
- `y SMALLINT` — viewport-percentage Y coordinate (click / mousemove events)
- `element_tag TEXT` — e.g. BUTTON, A (click events)
- `element_text TEXT` — truncated to 100 chars (click events)
- `payload JSONB NOT NULL DEFAULT '{}'`
- `occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`

Add a CHECK constraint: `event_type IN ('pageview', 'click', 'scroll_depth', 'optin', 'mousemove')`

Add these indexes (all `IF NOT EXISTS`):
1. `(project_id, event_type, occurred_at)` — time-range dashboard queries
2. `(session_id)` — session journey lookups
3. `(project_id, url)` — per-page heatmap aggregation
4. `(ghl_contact_id) WHERE ghl_contact_id IS NOT NULL` — join to journey_events

Add COMMENT ON TABLE and COMMENT ON COLUMN for all columns.

---

### Task 2 of 3 — Update `src/database.types.ts`

Add `page_events` to the `Tables` section of the `Database["public"]["Tables"]` interface. Follow the exact same format as the `journey_events` entry already in the file. Here is the `journey_events` entry as a format reference:

```typescript
journey_events: {
  Row: {
    contact_id: string | null
    created_at: string
    duration_seconds: number | null
    event_type: string
    id: string
    location_id: string | null
    meta_ad_id: string | null
    meta_adset_id: string | null
    meta_attribution_method: string | null
    meta_campaign_id: string | null
    occurred_at: string
    payload: Json
    project_id: string
    source_system: string
    webinar_run_id: string | null
  }
  Insert: {
    contact_id?: string | null
    // ... optional variants of all nullable/defaulted columns
    event_type: string
    occurred_at: string
    project_id: string
    source_system: string
  }
  Update: {
    // ... all optional
  }
  Relationships: [...]
}
```

Add a `page_events` entry under the same `Tables` object (alphabetical order). The `Relationships` array should contain one entry for the FK to `projects`. Do not touch any other part of the file.

---

### Task 3 of 3 — Create `app/api/track/route.ts`

This is the collector endpoint for the tracking pixel. Pattern reference: look at how `app/api/webhooks/ghl/optin/route.ts` is structured in the repo — it uses `after()`, type guards, and helper functions.

Create `app/api/track/route.ts`:

```
export const runtime = "nodejs";
```

**Request body shape:**
```typescript
type TrackEventInput = {
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

type TrackRequestBody = {
  site_id: string;        // project UUID
  session_id: string;     // browser session UUID
  events: TrackEventInput[];
};
```

**Logic:**
1. Parse and type-validate the JSON body. Reject if `site_id` or `session_id` is missing or not a string, or if `events` is not an array. Return 400 with `{ success: false, error: string }`.
2. Cap `events` at 50 items. Silently discard anything beyond index 49.
3. Validate that `site_id` is a real project: query `supabase.from("projects").select("id").eq("id", site_id).maybeSingle()`. If not found, return 200 (not 404 — avoids leaking project existence to scrapers) with `{ success: true, ignored: true, reason: "unknown_project" }`.
4. Use `after()` to defer the DB insert. In the background, map each event to a `page_events` Insert row: set `project_id = site_id`, `session_id`, clamp `scroll_depth` and `x`/`y` to 0–100, truncate `element_text` to 100 chars. Set `occurred_at` from the event if it is a valid ISO string, otherwise `new Date().toISOString()`. Insert the batch with a single `supabase.from("page_events").insert(rows)`.
5. Return `{ success: true, accepted: events.length }` immediately (before the background insert).

**Validating `occurred_at`:** write a small helper `function isIsoDateString(v: unknown): v is string` that returns true only if `v` is a string and `new Date(v).getTime()` is finite and not NaN.

---

## Agent 2 — Tracker script (`public/tracker.js`)

### Prompt

You are writing a vanilla JavaScript tracking pixel script for a Next.js project. This file will be served as a static asset at `https://nmdabn-server.vercel.app/tracker.js` and embedded into GHL (GoHighLevel) Funnel pages.

**This file is plain JavaScript — no TypeScript, no imports, no bundler.** It must work in any modern browser without any dependencies.

---

Create `public/tracker.js` as a self-invoking IIFE:

```javascript
(function () {
  "use strict";
  // all code here
})();
```

**Configuration (read from the script tag's data attributes):**

```html
<script
  src="https://nmdabn-server.vercel.app/tracker.js"
  data-site-id="PROJECT_UUID"
  async
></script>
```

Read config at runtime:
```javascript
var scriptTag = document.currentScript;
var SITE_ID = scriptTag && scriptTag.getAttribute("data-site-id");
var HEATMAP = scriptTag && scriptTag.getAttribute("data-heatmap") === "true";
var ENDPOINT = "https://nmdabn-server.vercel.app/api/track";
var FLUSH_INTERVAL_MS = 5000;
var SESSION_TIMEOUT_MS = 30 * 60 * 1000;
```

If `SITE_ID` is empty/missing, the script should do nothing and return early.

---

**Session management (localStorage):**

Keys: `nm_sid` (session UUID), `nm_last` (epoch ms string), `nm_cid` (GHL contact id, once known).

Rules:
- On load, read `nm_sid` and `nm_last`.
- If `nm_last` is missing or older than `SESSION_TIMEOUT_MS` from `Date.now()`, generate a new UUID with `crypto.randomUUID()` (fallback: `Math.random().toString(36).slice(2)` repeated if `crypto.randomUUID` is unavailable).
- Always write `nm_last = Date.now()` on init and update it on each flush.
- Expose `getSessionId()` and `getContactId()` / `setContactId(id)` helpers.

---

**UTM + fbclid capture:**

On init, read these URL params from `window.location.search`:
`utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, `utm_term`, `fbclid`.

Store them as a module-level object `var pageUtms = { ... }` so they are attached to every event.

---

**Event queue and flush:**

- Maintain a `var queue = []` array.
- `push(eventObj)` adds to queue.
- `flush()` sends queue if non-empty via `navigator.sendBeacon(ENDPOINT, JSON.stringify({ site_id: SITE_ID, session_id: getSessionId(), events: queue }))` then empties the queue. If `navigator.sendBeacon` is unavailable, fall back to `fetch(ENDPOINT, { method: "POST", body: ..., keepalive: true })`.
- Call `flush()` every `FLUSH_INTERVAL_MS` via `setInterval`.
- Call `flush()` on `window.addEventListener("beforeunload", flush)` and `window.addEventListener("pagehide", flush)`.

---

**Helper: `buildEvent(eventType, extra)`:**
Returns an object:
```javascript
{
  event_type: eventType,
  url: window.location.href,
  referrer: document.referrer,
  ghl_contact_id: getContactId() || undefined,
  occurred_at: new Date().toISOString(),
  utm_source: pageUtms.utm_source || undefined,
  utm_medium: pageUtms.utm_medium || undefined,
  utm_campaign: pageUtms.utm_campaign || undefined,
  utm_content: pageUtms.utm_content || undefined,
  utm_term: pageUtms.utm_term || undefined,
  fbclid: pageUtms.fbclid || undefined,
  // spread extra
}
```
Only include keys where the value is truthy (to keep payload small).

---

**Events to fire:**

1. **pageview** — fire once on script init: `push(buildEvent("pageview", {}))`.

2. **click** — `document.addEventListener("click", handler, true)`:
   - Compute `x` and `y` as viewport-percentage integers: `Math.round((e.clientX / window.innerWidth) * 100)` and `Math.round((e.clientY / window.innerHeight) * 100)`.
   - `element_tag`: `e.target.tagName` (string, uppercase).
   - `element_text`: `(e.target.innerText || e.target.value || "").slice(0, 100)`.
   - `push(buildEvent("click", { x, y, element_tag, element_text }))`.

3. **scroll_depth** — track max scroll:
   - `var maxScroll = 0;`
   - On `window.addEventListener("scroll", handler, { passive: true })`: compute `Math.min(100, Math.round((window.scrollY / Math.max(1, document.body.scrollHeight - window.innerHeight)) * 100))`. Update `maxScroll` if higher.
   - On `beforeunload`, push `buildEvent("scroll_depth", { scroll_depth: maxScroll })` directly (bypass queue, send immediately with beacon).

4. **optin** — two listeners:
   - `document.addEventListener("submit", handler)` — fires on native form submit.
   - `document.addEventListener("hl-form-submitted", handler)` — GHL's custom event.
   - For the `hl-form-submitted` handler: read contact id from `event.detail.contact_id || event.detail.contactId`. If found, call `setContactId(id)`, also `push(buildEvent("identify", { ghl_contact_id: id }))` to link the session retroactively.
   - `push(buildEvent("optin", {}))`.

5. **mousemove** (only if `HEATMAP === true`):
   - Throttle: only fire if `Date.now() - lastMoveTime > 1000`.
   - Compute `x`, `y` same as click.
   - `push(buildEvent("mousemove", { x, y }))`.

---

**Output requirements:**
- The file must have a JSDoc header block describing what it is, how to embed it, and the `data-*` options.
- Comments on each section (session management, event capture, etc.) are required.
- No minification — readable source.
- No external dependencies.

---

## Agent 3 — ContactCreate → journey_event hook

### Prompt

You are adding a new service and a small modification to an existing file in a Next.js 15 App Router project (TypeScript strict). The goal is to automatically create a `journey_event` row whenever a new GHL contact is created via the `ContactCreate` webhook.

**TypeScript rules (CRITICAL — do not violate):**
- No `any` type
- No non-null assertion operator (`!`)
- No `as unknown as T` casts
- Double quotes for all strings
- Template literals instead of string concatenation
- Full JSDoc on all exported functions

---

### Context: existing relevant code

**`src/services/ghl-webhook-post.ts` — the ContactCreate branch (lines 302–321):**

```typescript
if (CONTACT_UPSERT_TYPES.has(eventType)) {
  if (contactId === null) {
    console.warn(`GHL webhook ${eventType} without contact id:`, webhookId);
    return { status: 200, body: { success: true, ignored: true } };
  }

  scheduleBackgroundWork(async () => {
    try {
      await runGhlContactSyncForContactId(contactId, credentials);
      await assignNextWebinarRunForContactId(contactId);
    } catch (e) {
      console.error(`GHL webhook sync/assign failed for ${contactId}:`, e);
    }
  });

  return {
    status: 200,
    body: { success: true, accepted: true, action: "sync" },
  };
}
```

`CONTACT_UPSERT_TYPES` includes `ContactCreate`, `ContactUpdate`, `ContactTagUpdate`, `ContactDndUpdate`. We only want to write a journey_event for `ContactCreate`.

**`src/services/optin-meta-attribution.ts` — relevant exports:**

```typescript
export interface MetaAttributionResult {
  meta_ad_id: string | null;
  meta_adset_id: string | null;
  meta_campaign_id: string | null;
  method: "ad_id" | "name_match" | null;
}

// Resolves UTM params to Meta entity IDs via DB lookup.
export async function resolveMetaAttributionFromUtm(
  supabase: SupabaseClient<Database>,
  args: {
    utmSource: string;
    utmContent: string;
    utmCampaign: string;
    integrationAccountIds: string[];
  }
): Promise<MetaAttributionResult>

// Loads the integration_account_id values for a project (needed for resolveMetaAttributionFromUtm).
export async function loadIntegrationAccountIdsForProject(
  supabase: SupabaseClient<Database>,
  projectId: string
): Promise<string[]>
```

**`ghl_contacts` table — `raw_json` structure (relevant path for UTMs):**

GHL stores the attribution source inside `raw_json.contact.attributionSource`:
```json
{
  "contact": {
    "attributionSource": {
      "utmSource": "120213196...",
      "utmMedium": "paid",
      "utmCampaign": "insulinresistance",
      "utmContent": "GT1_Apple_FB_MY",
      "utmTerm": ""
    },
    "dateAdded": "2026-04-21T01:02:00.000Z"
  }
}
```

**`journey_events` table Insert shape (from `src/database.types.ts`):**

```typescript
{
  contact_id?: string | null       // GHL contact id
  event_type: string               // use "optin"
  id?: string                      // auto-generated
  location_id?: string | null      // GHL location id
  meta_ad_id?: string | null
  meta_adset_id?: string | null
  meta_attribution_method?: string | null
  meta_campaign_id?: string | null
  occurred_at: string              // ISO string from contact.dateAdded
  payload?: Json                   // use {}
  project_id: string
  source_system: string            // use "ghl_webhook"
  webinar_run_id?: string | null
}
```

**`projects` table has:** `id UUID`, `ghl_location_id TEXT | null`.

---

### Task 1 of 2 — Create `src/services/ghl-contact-optin-journey.ts`

This service is called after a contact sync completes. It:

1. Reads the contact row from `ghl_contacts` (select `id`, `project_id`, `location_id`, `raw_json`). If not found or `project_id` is null, return early with a log.

2. Extracts from `raw_json.contact.attributionSource`: `utmSource`, `utmMedium`, `utmCampaign`, `utmContent`, `utmTerm`. All are strings; use empty string as default if missing. Write a typed helper `extractAttributionSource(rawJson: Json): AttributionSource` where `AttributionSource` is a local interface.

3. Extracts `dateAdded` from `raw_json.contact.dateAdded`. If present and a valid ISO string, use it as `occurred_at`. Otherwise use `new Date().toISOString()`.

4. Calls `loadIntegrationAccountIdsForProject` and then `resolveMetaAttributionFromUtm` with the extracted UTMs.

5. Upserts into `journey_events` using `.upsert(..., { onConflict: "contact_id,event_type,source_system" })` — this prevents duplicate rows if the webhook fires twice for the same contact. **Important:** the unique constraint does not exist yet in the DB — also create a migration file `docs/database/migrations/034_journey_events_ghl_webhook_unique.sql` that adds:
   ```sql
   CREATE UNIQUE INDEX IF NOT EXISTS idx_journey_events_contact_optin_ghl
       ON public.journey_events (contact_id, event_type, source_system)
       WHERE contact_id IS NOT NULL
         AND event_type = 'optin'
         AND source_system = 'ghl_webhook';
   ```

Export one function:
```typescript
export async function createOptinJourneyEventForContact(
  contactId: string
): Promise<void>
```

It takes only `contactId` and uses the module-level `supabase` client from `@/config/supabase`.

---

### Task 2 of 2 — Update `src/services/ghl-webhook-post.ts`

Import `createOptinJourneyEventForContact` from the new service.

In the `CONTACT_UPSERT_TYPES` branch, change the `scheduleBackgroundWork` callback to also call the new function **only when `eventType === "ContactCreate"`**:

```typescript
scheduleBackgroundWork(async () => {
  try {
    await runGhlContactSyncForContactId(contactId, credentials);
    await assignNextWebinarRunForContactId(contactId);
    if (eventType === "ContactCreate") {
      await createOptinJourneyEventForContact(contactId);
    }
  } catch (e) {
    console.error(`GHL webhook sync/assign failed for ${contactId}:`, e);
  }
});
```

Do not change any other part of `ghl-webhook-post.ts`. Do not change the return value or the function signature.
