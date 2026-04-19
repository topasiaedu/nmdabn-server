# Zoom attendance segments and journey design

**Raw:** `raw/sources/2026-04-15-zoom-attendance-segments-journey-design.md`  
**Repo (current sync):** `../src/services/zoom-participants-sync.ts`, `../app/api/actions/sync/zoom/route.ts`  
**Repo (journey schema):** `../docs/database/migrations/011_journey_events.sql` (and later migrations touching `journey_events`)

## Summary

This ingest records a **planned** split between (1) a dedicated **`zoom_attendance_segments`** table for granular join/leave facts and concurrency analytics, and (2) **`journey_events`** as the **rollup** (“attended this run”) for Show Up and collapsed journey UI. Zoom cloud recording is optional UX (**manual scrub** near the chart); deep graph-to-video seek is **out of scope** for v1.

## Key facts

- **Audience graph:** Built from segment timestamps → concurrent counts over time; **no per-bucket identity** required for the first chart.
- **Journey UI:** Collapsed = total minutes attended; expanded = list of segments (join/leave).
- **Show Up:** Binary attended if email matches contact — **any** duration including 1 second counts once per run.
- **Mismatched Zoom email:** **App-only contact**; **no** GHL create/sync for that identity.
- **Schema:** New table for segments + keep `journey_events` for attended signal; DDL remains in repo `docs/database/migrations/` when implemented (wiki does not replace migrations per [[CLAUDE]]).

## Open questions (for implementation phase)

- Exact **idempotency key** per segment row (Zoom field stability across API versions).
- Whether rollup **`journey_events`** row is **insert-once** or **upsert** when segments change on re-sync.
- Whether **app-only contacts** live on `ghl_contacts` with a flag or on a separate `app_contacts` table (impacts FKs and RLS).

## Related

- **Concept (synthesis):** [[Zoom-Attendance-Segments-And-Journey]]
- [[Buyer-Journey-Event-Store]] · [[Zoom-Integration-Architecture]] · [[Webinar-Run-Zoom-Linkage]] · [[Zoom]]
