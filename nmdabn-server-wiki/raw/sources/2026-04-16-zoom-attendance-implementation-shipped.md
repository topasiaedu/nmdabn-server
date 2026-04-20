# Zoom attendance model — implementation shipped (recap)

**Date:** 2026-04-16  
**Context:** Implementation and merge to `main` of the 2026-04-15 design in `2026-04-15-zoom-attendance-segments-journey-design.md`. This file is a **frozen** handoff for the vault ingest; it does not replace the design note.

## What shipped in the repo

### Database (apply on Supabase / Postgres before re-running sync)

- **`docs/database/migrations/024_zoom_attendance_segments_and_app_contacts.sql`**
  - Table **`zoom_attendance_segments`**: one row per Zoom participant report line, with `UNIQUE (webinar_run_id, idempotency_key)`.
  - **`ghl_contacts`**: `is_app_only` (boolean, default false), `app_only_project_id` (UUID → `projects`), partial unique index for app-only email per project.
- Manifest row: `docs/database/README.md` lists migration 024.

### Application sync

- **`src/services/zoom-participants-sync.ts`**
  - Fetches participant report (unchanged Zoom S2S path).
  - **Idempotency key** per segment: `webinar_run_id` + normalized email + `join_time`, or `webinar_run_id` + Zoom `id` / `user_id` + `join_time` when email is empty.
  - **Upserts** `zoom_attendance_segments` (on conflict `webinar_run_id, idempotency_key`).
  - **Resolves contact:** GHL-mirrored row for `location_id` with `is_app_only = false` and matching email; else reuses or creates **app-only** `ghl_contacts` (`nmdapp-` + UUID, `source: zoom_app_only`, `app_only_project_id` set).
  - For each contact with at least one segment, **upserts exactly one** `journey_events` row: `source_system = zoom`, `event_type = attended`, **aggregated** `duration_seconds` and payload meta (`zoom_segment_count`, `zoom_total_duration_seconds`, …).
  - Exported helper: **`isAppOnlyGhlContactId`** for callers that must skip GHL mirror for synthetic ids.

- **`src/services/ghl-contact-mirror-upsert.ts`**: if contact `id` starts with `nmdapp-`, **returns without overwriting** — app-only rows never get clobbered by GHL mirror.

- **`app/api/actions/sync/zoom/route.ts`**: JSON responses include **`segmentsUpserted`** and **`rollupsUpdated`** (single-run and project-batch).

- **`scripts/sync-zoom-participants.mjs`**: aligned with the TypeScript service (segments + rollup).

- **`src/database.types.ts`**: types for **`zoom_attendance_segments`** and new **`ghl_contacts`** columns.

### Operational prerequisite

Apply migration **024** on the target database **before** expecting segment rows or app-only columns to exist when running Zoom sync (`POST` sync route or CLI script).

## Resolved from the 2026-04-15 “open questions” list

| Design question | Resolution shipped |
|-----------------|-------------------|
| Idempotency key stability | Stable key derived from join time + identity (email or Zoom participant id fields). |
| Rollup insert vs upsert | **Upsert**: one rollup row per `(webinar_run_id, contact_id)` for zoom attended; totals refresh on re-sync. |
| App-only storage | Rows on **`ghl_contacts`** with `is_app_only` / `app_only_project_id`; not a separate table. |

## Paths (relative to repo root)

- DDL: `docs/database/migrations/024_zoom_attendance_segments_and_app_contacts.sql`
- Sync: `src/services/zoom-participants-sync.ts`
- HTTP: `app/api/actions/sync/zoom/route.ts`
- CLI: `scripts/sync-zoom-participants.mjs`
