# Custom Tracking Pixel — Design

**Raw:** `raw/sources/2026-04-22-custom-tracking-pixel-design.md`
**Repo:** `public/tracker.js`, `app/api/track/route.ts`, `src/services/ghl-contact-optin-journey.ts`

## Summary

A lightweight first-party JavaScript tracking pixel for GHL Funnel pages. It captures visitor events (page views, clicks, scroll depth, opt-ins, mouse movement) and sends them to a new collector API backed by the `page_events` Supabase table. A companion `ContactCreate` GHL webhook hook writes `journey_events` rows for real-time lead attribution without requiring any GHL Workflow setup.

## Key facts

- Script embedded as a `<script>` tag in GHL Funnel header with `data-site-id="PROJECT_UUID"`
- Session managed via `localStorage` keys `nm_sid` (UUID), `nm_last` (epoch ms), `nm_cid` (GHL contact ID once known)
- 30-minute session inactivity timeout; new session UUID generated on expiry
- UTMs and `fbclid` captured from URL on page load and attached to every event
- Events are batched in a queue and flushed every 5 seconds and on page unload via `fetch` with `keepalive: true` (replaced `navigator.sendBeacon` due to CORS issues with `credentials: 'include'`)
- GHL fires `hl-form-submitted` custom event with `detail.contact_id` at form submission; the tracker captures this, stores it as `nm_cid`, and sends `identify` + `optin` events
- Heatmap mode (`data-heatmap="true"`) enables `mousemove` events throttled to 1 per second; off by default

## Database: `page_events`

Migration `033_page_events.sql`. Columns: `id`, `project_id` (FK), `session_id`, `ghl_contact_id`, `event_type`, `url`, `referrer`, `utm_*`, `fbclid`, `scroll_depth`, `x`, `y`, `element_tag`, `element_text`, `payload`, `occurred_at`. Joined to `journey_events` via `ghl_contact_id` for full-funnel analysis.

## Collector API

`app/api/track/route.ts` — public POST endpoint. Validates `site_id` against `projects` table, caps events at 50, uses `after()` for background DB insert, returns 200 immediately.

## ContactCreate hook

`src/services/ghl-contact-optin-journey.ts` — called from `ghl-webhook-post.ts` on `ContactCreate`. Reads `raw_json.contact.attributionSource` UTMs, resolves Meta attribution, upserts `journey_events` with `source_system='ghl_webhook'`. Idempotency via migration 034 unique index.

## Open questions

- Phase 2: heatmap rendering (normalise x/y across viewport sizes) — data collected, visualisation deferred
- Phase 2: session recording replay

## Related

- [[First-Party-Tracking-Pixel]]
- [[GHL-ContactCreate-Optin-Hook]]
- [[Lead-Attribution-Pipeline]]
- [[Buyer-Journey-Event-Store]]
- `../docs/database/migrations/033_page_events.sql`
- `../docs/database/migrations/034_journey_events_ghl_webhook_unique.sql`
- `../public/tracker.js`
- `../app/api/track/route.ts`
