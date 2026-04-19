# Zoom attendance segments and journey rollup

**Definition / scope**

How we plan to store **Zoom join/leave facts** for analytics and journey detail, while keeping **`journey_events`** as the **simple “attended”** signal for Show Up and collapsed timelines. Agreed **2026-04-15**; see raw design note and ingest: [[Zoom-Attendance-Segments-And-Journey-Design]].

## Why two layers

- **Segments** answer: “When were they in the room?” and support **concurrent headcount** curves (drop-off / peak).
- **Journey `journey_events`** answers: “Did they attend this run?” for **dashboards** and a **single collapsed** journey line—without duplicating every segment in the same table long-term.

## Planned tables / roles

| Artifact | Role |
|----------|------|
| `zoom_attendance_segments` (new) | One row per **presence segment** (or per API fact row), with `webinar_run_id`, `project_id`, `zoom_meeting_id`, `join_at` / `leave_at` / `duration_seconds`, optional `raw_payload`, `contact_id`, idempotent ingest key. |
| `journey_events` | **`event_type = attended`**, **`source_system = zoom`**: rollup “this contact attended this run”; optional summed duration / metadata in `payload`. |

## Product rules (locked intent)

1. **Show Up:** If Zoom email **matches** the contact, **any** attendance duration **≥ 1 second** → count **attended** once for that run.
2. **Journey expand:** User sees **all join/leave segments** under one collapsed “Attended X min” row.
3. **Wrong Zoom email:** Create **app-only** contact; **do not** sync to GHL.
4. **Recording:** Let users **play** Zoom recording and **scrub** to time of interest; **no** v1 requirement for graph-click-to-seek or hosting full MP4 ourselves.

## Ingestion flow (target)

1. Pull participant report (existing Zoom S2S path per [[Zoom-Integration-Architecture]]).
2. Upsert **segments** (idempotent).
3. Resolve or create **contact** (GHL match vs app-only).
4. Ensure **`journey_events`** attended row exists / updates rollup for that contact + `webinar_run_id`.

Current production code still writes **`journey_events` only** until migrations and sync are extended.

## Related

- [[Zoom-Attendance-Segments-And-Journey-Design]] · [[Buyer-Journey-Event-Store]] · [[Webinar-Run-Zoom-Linkage]] · [[Zoom-Integration-Architecture]] · [[Zoom]]
- `../src/services/zoom-participants-sync.ts`

## Contradictions / history

- [[Buyer-Journey-Event-Store]] currently describes **one** Zoom path into `journey_events` and idempotency on email + run. This concept **extends** that with a segment table; when implemented, the event-store page should reference this concept and the new migration file names.
