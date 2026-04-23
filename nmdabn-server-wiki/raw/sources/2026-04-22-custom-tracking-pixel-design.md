# Custom Tracking Pixel — Design

**Date:** 2026-04-22
**Status:** Design complete, implementation pending.

## Problem

The Ads Manager dashboard attributes leads to Meta campaigns via UTM parameters captured at opt-in. This gives per-campaign CPL but tells you nothing about the visitor journey *before* the opt-in: which pages they visited, how long they engaged, whether they scrolled through the offer, or which CTA they clicked. Without this data it is impossible to know if a landing page is underperforming or if a particular ad angle drives higher-quality visitors.

Additionally, the current lead capture only fires when a new GHL contact is created (`ContactCreate` webhook). Leads whose journey data came from a CSV import have Meta attribution but no real-time path forward — once the CSV backfill is complete there is no automated mechanism to capture new opt-ins.

## Solution

A lightweight first-party JavaScript tracking script embedded into GHL Funnels that captures all meaningful visitor events and sends them to a new collector API, backed by a new `page_events` Supabase table. Separately, the existing `ContactCreate` GHL webhook handler is extended to also write a `journey_event` row when a new contact is created, solving the real-time lead capture gap without requiring any GHL Workflow setup.

## Architecture

```
GHL Funnel page
└── <script src="https://nmdabn-server.vercel.app/tracker.js" data-site-id="PROJECT_UUID">

tracker.js (vanilla IIFE, ~150 lines)
├── reads/writes localStorage  (nm_sid = session UUID, nm_last = last-seen timestamp)
├── captures UTMs + fbclid from URL on load
├── fires: pageview, click, scroll_depth, optin, mousemove (opt-in heatmap mode)
├── captures GHL contact_id from hl-form-submitted event detail
└── batches events → navigator.sendBeacon → POST /api/track

POST /api/track  (Next.js route, nodejs runtime)
├── validates site_id against projects table
├── bulk-inserts events into page_events via after()
└── returns 200 immediately

page_events (Supabase / Postgres)
└── joined with journey_events via ghl_contact_id for full funnel analysis
```

## Database — `033_page_events.sql`

New table `public.page_events`:

| Column | Type | Notes |
|---|---|---|
| `id` | UUID | PK, gen_random_uuid() |
| `project_id` | UUID | FK → projects(id) ON DELETE CASCADE |
| `session_id` | TEXT NOT NULL | localStorage UUID, per-browser per 30 min |
| `ghl_contact_id` | TEXT | GHL contact id, set when visitor identifies via form submit |
| `event_type` | TEXT NOT NULL | `pageview \| click \| scroll_depth \| optin \| mousemove` |
| `url` | TEXT | Full href |
| `referrer` | TEXT | document.referrer |
| `utm_source` | TEXT | |
| `utm_medium` | TEXT | |
| `utm_campaign` | TEXT | |
| `utm_content` | TEXT | |
| `utm_term` | TEXT | |
| `fbclid` | TEXT | Facebook click ID, if present in URL |
| `scroll_depth` | SMALLINT | 0–100, set on scroll_depth events |
| `x` | SMALLINT | Viewport-percentage X coordinate (click / mousemove) |
| `y` | SMALLINT | Viewport-percentage Y coordinate (click / mousemove) |
| `element_tag` | TEXT | e.g. BUTTON, A |
| `element_text` | TEXT | Truncated to 100 chars |
| `payload` | JSONB | Escape hatch for future fields |
| `occurred_at` | TIMESTAMPTZ NOT NULL | Sent from client, default NOW() |

Indexes:
- `(project_id, event_type, occurred_at)` — dashboard time-range queries
- `(session_id)` — session journey lookup
- `(project_id, url)` — per-page heatmap aggregation
- `(ghl_contact_id)` where not null — join to journey_events

## Collector API — `app/api/track/route.ts`

- `POST /api/track` — public, no auth header
- Body: `{ site_id: string, events: TrackEvent[] }` (max 50 events per batch)
- `site_id` = project UUID; validated against `projects` table
- Uses `after()` from `next/server` so the 200 is returned before the DB insert
- Batch `.insert()` into `page_events` in a single Supabase call
- Returns `{ success: true, accepted: number }` or `{ success: false, error: string }`

## Tracker Script — `public/tracker.js`

Self-contained IIFE. Configured via `data-*` attributes on the `<script>` tag:

```html
<script
  src="https://nmdabn-server.vercel.app/tracker.js"
  data-site-id="YOUR_PROJECT_UUID"
  async
></script>
```

Add `data-heatmap="true"` to also send `mousemove` events (throttled to 1/sec). Off by default to avoid high write volume.

**Session management:** `localStorage` keys `nm_sid` (UUID) and `nm_last` (epoch ms). If `nm_last` is older than 30 minutes, a new `nm_sid` is generated.

**Events fired automatically:**

| Trigger | event_type | Key fields sent |
|---|---|---|
| Page load | `pageview` | url, referrer, UTMs, fbclid |
| Any element click | `click` | x/y as viewport %, element_tag, element_text |
| `beforeunload` | `scroll_depth` | max scroll % reached during page visit |
| Form `submit` OR `hl-form-submitted` | `optin` | url, UTMs, ghl_contact_id (from event detail) |
| mousemove (only if `data-heatmap="true"`) | `mousemove` | x/y as viewport %, throttled 1/sec |

**Identifying the visitor:** GHL fires `hl-form-submitted` with `event.detail.contact_id` (or `event.detail.contactId`) at form submission. The tracker captures this, stores it in `localStorage` as `nm_cid`, and attaches it to all subsequent events. An `identify` payload is also sent immediately to link past session events to the contact.

**Batching:** events are queued in a local array and flushed every 5 seconds and on `beforeunload` via `navigator.sendBeacon`.

## ContactCreate → journey_event hook

When `ContactCreate` fires in `src/services/ghl-webhook-post.ts`, after `runGhlContactSyncForContactId` completes, the handler should also:

1. Read the newly-synced contact row from `ghl_contacts` to get UTM fields from `raw_json.contact.attributionSource`
2. Call `resolveMetaAttributionFromUtm` from `src/services/optin-meta-attribution.ts`
3. Insert a `journey_events` row: `event_type = 'optin'`, `source_system = 'ghl_webhook'`

The logic lives in a new thin service `src/services/ghl-contact-optin-journey.ts` so `ghl-webhook-post.ts` stays focused on routing.

**Idempotency:** upsert on `(contact_id, event_type, source_system)` with a stable `occurred_at` derived from the contact's `dateAdded` field (from `raw_json`), not from `NOW()`. This prevents duplicate rows if the webhook fires twice.

## GHL Setup (per funnel, one-time)

1. Open the GHL Funnel
2. Settings → Custom Code → Header
3. Paste the `<script>` tag with `data-site-id` set to the project UUID

No GHL Workflow setup required for the `ContactCreate` path.

## Heatmap — Phase 2 note

The `page_events` table has `x`, `y`, and `event_type = 'mousemove'` ready. Rendering a heatmap requires normalising pixel coordinates against the page layout at different viewport sizes — this is a non-trivial front-end problem deferred to Phase 2. The data collection infra is in place from day one.

## Files

| File | Action |
|---|---|
| `docs/database/migrations/033_page_events.sql` | Create |
| `src/database.types.ts` | Update — add `page_events` Row/Insert/Update |
| `app/api/track/route.ts` | Create |
| `public/tracker.js` | Create |
| `src/services/ghl-contact-optin-journey.ts` | Create |
| `src/services/ghl-webhook-post.ts` | Update — call new service on ContactCreate |
