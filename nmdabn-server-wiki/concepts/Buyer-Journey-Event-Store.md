# Buyer journey event store

Architecture pattern for a unified per-contact timeline from Zoom, GHL, first-party web, and manual sources. Updated 2026-04-22 to include Meta attribution columns and tracking pixel integration.

## Why not "only GHL"

GHL gives CRM state, webhooks, and conversations—not a substitute for **full site page-view history**. First-party events land in **our** database; optional selective push to GHL custom fields/workflows.

## Decided schema (migration 011 — 2026-04-13)

Table name: **`journey_events`**

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `occurred_at` | TIMESTAMPTZ | Event time (join time for Zoom) |
| `event_type` | TEXT | e.g. `attended`, `optin`, `purchased` |
| `source_system` | TEXT | `CHECK IN ('ghl', 'zoom', 'web', 'manual', 'ghl_webhook')` |
| `contact_id` | TEXT | FK → `ghl_contacts.id`; nullable pre-resolution |
| `location_id` | TEXT | GHL location; scopes without always joining |
| `project_id` | UUID | FK → `projects.id` |
| `webinar_run_id` | UUID | FK → `webinar_runs.id`; nullable |
| `duration_seconds` | INTEGER | Typed Zoom column; NULL for non-Zoom events |
| `payload` | JSONB | Full vendor-specific fields |
| `created_at` | TIMESTAMPTZ | DEFAULT NOW() |
| `meta_ad_id` | TEXT | Resolved Meta ad ID (migration 032) |
| `meta_adset_id` | TEXT | Resolved Meta ad set ID (migration 032) |
| `meta_campaign_id` | TEXT | Resolved Meta campaign ID (migration 032) |
| `meta_attribution_method` | TEXT | `'ad_id'` or `'name_match'` (migration 032) |

**Zoom attendance (after migration 024 + sync):** Participant lines land in **`zoom_attendance_segments`** first; **`journey_events`** holds **one attended rollup per contact per webinar run** (`source_system = zoom`, `event_type = attended`) with aggregated duration and segment metadata in `payload`. Segment idempotency uses `(webinar_run_id, idempotency_key)`; rollup rows are **upserted** when sync re-runs.

## Segment store + rollup (2026-04-15 design, implemented 2026-04-16)

Implemented — see [[Zoom-Attendance-Segments-And-Journey]], [[Zoom-Attendance-Implementation-Shipped]], migration **`024_zoom_attendance_segments_and_app_contacts.sql`**.

- **`zoom_attendance_segments`** for join/leave facts and concurrency-style charts.
- **`journey_events`** remains the **rollup** "attended this run" row for Show Up and collapsed journey UI.
- **App-only contacts** on **`ghl_contacts`** when Zoom email does not match GHL mirror (`is_app_only`, `app_only_project_id`; ids `nmdapp-*`). GHL mirror upsert must not overwrite these rows.

## Opt-in events and Meta attribution (migration 032, 2026-04-22)

`journey_events` now stores opt-in events from two sources:

1. **CSV import** (`src/services/optin-journey-import.ts`) — historical backfill from spreadsheet data. UTMs are resolved to Meta entity IDs via [[Lead-Attribution-Pipeline]].
2. **GHL ContactCreate webhook** (`src/services/ghl-contact-optin-journey.ts`) — real-time: fires when a new GHL contact is created. See [[GHL-ContactCreate-Optin-Hook]].
3. **Custom GHL Workflow webhook** (`app/api/webhooks/ghl/optin/route.ts`) — fires on repeat opt-ins.

**Idempotency for GHL webhook opt-ins:** migration 034 adds a unique index on `(contact_id, event_type, source_system)` where `source_system='ghl_webhook'`.

## `page_events` — first-party web tracking (migration 033, 2026-04-22)

`page_events` is a **companion table** (not a replacement) for richer visitor-level data before and after the opt-in event. Joined to `journey_events` via `ghl_contact_id`. See [[First-Party-Tracking-Pixel]].

## Ingest paths

- **GHL:** webhooks (and API where needed) append lifecycle events.
- **Zoom:** S2S OAuth participant report API — `source_system = 'zoom'`, `event_type = 'attended'`. See [[Zoom-Integration-Architecture]] and [[Webinar-Run-Zoom-Linkage]] for credential chain and endpoint selection. **Manual export is no longer the plan** (superseded 2026-04-13).
- **Web (opt-in):** GHL ContactCreate webhook → `ghl-webhook-post.ts` → `createOptinJourneyEventForContact`. See [[GHL-ContactCreate-Optin-Hook]].
- **First-party page events:** `public/tracker.js` → `POST /api/track` → `page_events`. See [[First-Party-Tracking-Pixel]].

## Dashboard alignment

- **Showed** = any `journey_events` row for a contact where `source_system = 'zoom'` AND `event_type = 'attended'` AND `webinar_run_id` matches.
- **Minutes attended** = `duration_seconds / 60` from the same row.
- **Opt-in / Lead count** for Ads Manager = COUNT of `journey_events` where `event_type = 'optin'` in date range, grouped by `meta_campaign_id` / `meta_adset_id` / `meta_ad_id`. Timezone: KL `+08:00`.
- **"Showed" denominator** (Show Up dashboard %) is an [[Phase-1-Open-Decisions|open decision]]; assumed = total leads for the webinar run + line.

## Related

- [[Zoom-Integration-Architecture]]
- [[Webinar-Run-Zoom-Linkage]]
- [[Phase-1-Build-Order]]
- [[Phase-1-Open-Decisions]]
- [[Buyer-Journey-Tracking-Zoom-GHL-First-Party]]
- [[Product-Phase-Roadmap]]
- [[GHL-Webhook-Pipeline]]
- [[GHL-ContactCreate-Optin-Hook]]
- [[Lead-Attribution-Pipeline]]
- [[First-Party-Tracking-Pixel]]
- [[Zoom]] · [[GoHighLevel]] · [[Meta-Ads]]
- [[Zoom-Attendance-Segments-And-Journey]] (segment store + rollup)
- `../docs/database/migrations/011_journey_events.sql` — base `journey_events` schema
- `../docs/database/migrations/024_zoom_attendance_segments_and_app_contacts.sql` — segments + app-only columns
- `../docs/database/migrations/032_journey_events_meta_attribution.sql` — Meta attribution columns
- `../docs/database/migrations/033_page_events.sql` — companion first-party tracking table
- `../docs/database/migrations/034_journey_events_ghl_webhook_unique.sql` — GHL webhook idempotency index
