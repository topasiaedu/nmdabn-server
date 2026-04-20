# Zoom attendance implementation shipped

**Raw:** `raw/sources/2026-04-16-zoom-attendance-implementation-shipped.md`  
**Prior design ingest:** [[Zoom-Attendance-Segments-And-Journey-Design]] (`2026-04-15` raw)

## Summary

As of merge to `main`, the repo implements the **segment table + journey rollup + app-only contacts** model described in [[Zoom-Attendance-Segments-And-Journey]]. Canonical DDL is **`024_zoom_attendance_segments_and_app_contacts.sql`** under `../docs/database/migrations/`. Operators must **apply migration 024** before Zoom sync writes succeed.

## Key facts

- **`zoom_attendance_segments`**: upsert per participant line; conflict target `(webinar_run_id, idempotency_key)`.
- **`journey_events`**: one **`attended`** rollup per **`(webinar_run_id, contact_id)`** for `source_system = zoom`; payload includes segment count and total duration.
- **App-only contacts:** `ghl_contacts` with `is_app_only` and `app_only_project_id`; ids prefixed `nmdapp-`; GHL mirror upsert skips these ids.
- **API / CLI:** sync route returns **`segmentsUpserted`** and **`rollupsUpdated`**; `scripts/sync-zoom-participants.mjs` mirrors service behavior.

## Related

- **Concept:** [[Zoom-Attendance-Segments-And-Journey]]
- **Event store:** [[Buyer-Journey-Event-Store]]
- **Entity:** [[Zoom]]
