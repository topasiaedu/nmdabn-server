# Buyer journey event store

Architecture pattern for a unified per-contact timeline from Zoom, GHL, first-party web, and manual sources.

## Why not “only GHL”

GHL gives CRM state, webhooks, and conversations—not a substitute for **full site page-view history**. First-party events land in **our** database; optional selective push to GHL custom fields/workflows.

## Decided schema (migration 011 — 2026-04-13)

Table name: **`journey_events`**

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `occurred_at` | TIMESTAMPTZ | Event time (join time for Zoom) |
| `event_type` | TEXT | e.g. `attended`, `opted_in`, `purchased` |
| `source_system` | TEXT | `CHECK IN ('ghl', 'zoom', 'web', 'manual')` |
| `contact_id` | TEXT | FK → `ghl_contacts.id`; nullable pre-resolution |
| `location_id` | TEXT | GHL location; scopes without always joining |
| `project_id` | UUID | FK → `projects.id` |
| `webinar_run_id` | UUID | FK → `webinar_runs.id`; nullable |
| `duration_seconds` | INTEGER | Typed Zoom column; NULL for non-Zoom events |
| `payload` | JSONB | Full vendor-specific fields |
| `created_at` | TIMESTAMPTZ | DEFAULT NOW() |

Idempotency key for Zoom upserts: `(zoom_meeting_id from payload, participant email)`.

## Ingest paths

- **GHL:** webhooks (and API where needed) append lifecycle events.
- **Zoom:** S2S OAuth participant report API — `source_system = 'zoom'`, `event_type = 'attended'`. See [[Zoom-Integration-Architecture]] and [[Webinar-Run-Zoom-Linkage]] for credential chain and endpoint selection. **Manual export is no longer the plan** (superseded 2026-04-13).
- **Web:** first-party tracker POSTs or server-side events (Phase 2+).

## Dashboard alignment

- **Showed** = any `journey_events` row for a contact where `source_system = 'zoom'` AND `event_type = 'attended'` AND `webinar_run_id` matches.
- **Minutes attended** = `duration_seconds / 60` from the same row.
- **"Showed" denominator** (Show Up dashboard %) is an [[Phase-1-Open-Decisions|open decision]]; assumed = total leads for the webinar run + line.
- Phase 1 fixes the schema so a journey UI later is additive, not a rewrite.

## Related

- [[Zoom-Integration-Architecture]]
- [[Webinar-Run-Zoom-Linkage]]
- [[Phase-1-Build-Order]]
- [[Phase-1-Open-Decisions]]
- [[Buyer-Journey-Tracking-Zoom-GHL-First-Party]]
- [[Product-Phase-Roadmap]]
- [[GHL-Webhook-Pipeline]]
- [[Zoom]] · [[GoHighLevel]]
- `../docs/database/migrations/011_*.sql` (planned)
