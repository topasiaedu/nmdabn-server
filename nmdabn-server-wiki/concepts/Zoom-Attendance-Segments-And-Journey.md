# Zoom attendance segments and journey rollup

**Definition / scope**

How we store **Zoom join/leave facts** for analytics and journey detail, while keeping **`journey_events`** as the **simple “attended”** signal for Show Up and collapsed timelines. Design agreed **2026-04-15** ([[Zoom-Attendance-Segments-And-Journey-Design]]); implementation recap **2026-04-16** ([[Zoom-Attendance-Implementation-Shipped]]).

## Why two layers

- **Segments** answer: “When were they in the room?” and support **concurrent headcount** curves (drop-off / peak).
- **Journey `journey_events`** answers: “Did they attend this run?” for **dashboards** and a **single collapsed** journey line—without duplicating every segment in the same table long-term.

## Tables / roles (implemented)

| Artifact | Role |
|----------|------|
| `zoom_attendance_segments` | One row per Zoom participant report line; **`UNIQUE (webinar_run_id, idempotency_key)`**. DDL: migration **024** (`docs/database/migrations/024_zoom_attendance_segments_and_app_contacts.sql`). |
| `journey_events` | **`event_type = attended`**, **`source_system = zoom`**: **one rollup row per contact per run**; `duration_seconds` and `payload` aggregate segments (`zoom_segment_count`, `zoom_total_duration_seconds`). |

## Product rules (locked intent)

1. **Show Up:** If Zoom email **matches** the contact, **any** attendance duration **≥ 1 second** → count **attended** once for that run.
2. **Journey expand:** User sees **all join/leave segments** under one collapsed “Attended X min” row.
3. **Wrong Zoom email:** Create **app-only** contact; **do not** sync to GHL.
4. **Recording:** Let users **play** Zoom recording and **scrub** to time of interest; **no** v1 requirement for graph-click-to-seek or hosting full MP4 ourselves.

## Ingestion flow (current)

1. Pull participant report (Zoom S2S path per [[Zoom-Integration-Architecture]]).
2. Upsert **`zoom_attendance_segments`** (idempotent on `webinar_run_id` + idempotency key).
3. Resolve or create **contact** (GHL mirror match vs **app-only** `ghl_contacts` row for the project).
4. **Upsert** **`journey_events`** attended rollup for that contact + `webinar_run_id` (totals refresh on re-sync).

Implemented in **`../src/services/zoom-participants-sync.ts`**; mirror upsert skips synthetic **`nmdapp-`** ids (`../src/services/ghl-contact-mirror-upsert.ts`).

## Related

- [[Zoom-Attendance-Segments-And-Journey-Design]] · [[Zoom-Attendance-Implementation-Shipped]] · [[Buyer-Journey-Event-Store]] · [[Webinar-Run-Zoom-Linkage]] · [[Zoom-Integration-Architecture]] · [[Zoom]]
- `../src/services/zoom-participants-sync.ts`

## Contradictions / history

- **Superseded 2026-04-16:** earlier note that sync wrote **`journey_events` only** — replaced by segments + rollup as above after migration **024** is applied and sync is re-run.
