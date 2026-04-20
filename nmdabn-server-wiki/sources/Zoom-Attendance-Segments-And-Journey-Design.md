# Zoom attendance segments and journey design

**Raw:** `raw/sources/2026-04-15-zoom-attendance-segments-journey-design.md`  
**Repo (current sync):** `../src/services/zoom-participants-sync.ts`, `../app/api/actions/sync/zoom/route.ts`  
**Repo (journey schema):** `../docs/database/migrations/011_journey_events.sql` (and later migrations touching `journey_events`)

## Summary

This ingest records the **2026-04-15 agreed design**: a split between (1) a dedicated **`zoom_attendance_segments`** table for granular join/leave facts and concurrency analytics, and (2) **`journey_events`** as the **rollup** (“attended this run”) for Show Up and collapsed journey UI. Zoom cloud recording is optional UX (**manual scrub** near the chart); deep graph-to-video seek is **out of scope** for v1.

**Implementation status:** shipped in repo (migration **024**, sync service, mirror guard). See frozen recap `raw/sources/2026-04-16-zoom-attendance-implementation-shipped.md` and wiki digest [[Zoom-Attendance-Implementation-Shipped]].

## Key facts

- **Audience graph:** Built from segment timestamps → concurrent counts over time; **no per-bucket identity** required for the first chart.
- **Journey UI:** Collapsed = total minutes attended; expanded = list of segments (join/leave).
- **Show Up:** Binary attended if email matches contact — **any** duration including 1 second counts once per run.
- **Mismatched Zoom email:** **App-only contact**; **no** GHL create/sync for that identity.
- **Schema:** New table for segments + keep `journey_events` for attended signal; DDL remains in repo `docs/database/migrations/` when implemented (wiki does not replace migrations per [[CLAUDE]]).

## Design-time questions (resolved in implementation — see [[Zoom-Attendance-Implementation-Shipped]])

- **Idempotency key:** stable composite from join time + email or Zoom participant id fields.
- **Rollup:** **upsert** one `journey_events` attended row per contact per run; refresh totals on re-sync.
- **App-only contacts:** **`ghl_contacts`** with `is_app_only` / `app_only_project_id`.

## Related

- **Shipped recap:** [[Zoom-Attendance-Implementation-Shipped]]
- **Concept (synthesis):** [[Zoom-Attendance-Segments-And-Journey]]
- [[Buyer-Journey-Event-Store]] · [[Zoom-Integration-Architecture]] · [[Webinar-Run-Zoom-Linkage]] · [[Zoom]]
