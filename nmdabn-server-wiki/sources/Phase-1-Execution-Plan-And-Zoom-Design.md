# Phase 1 execution plan + Zoom / webinar design decisions

**Raw:** [2026-04-13-phase1-execution-plan-and-zoom-webinar-design.md](../raw/sources/2026-04-13-phase1-execution-plan-and-zoom-webinar-design.md)
**Session date:** 2026-04-13

## Summary

Planning session after pulling latest repo. Covers the full **Phase 1 build order**, all **Zoom integration design decisions** (per-project accounts, S2S OAuth, meeting vs webinar product handling, explicit Zoom ID linkage), **`journey_events` table decision**, and the **4 open decisions** blocking completion. Supersedes any prior informal notes about Zoom being manual-import only.

## Key facts

- **Build order agreed:** foundation first (multi-project + schema + hygiene) → Zoom integration → admin UI → SQL RPCs → backend routes → frontend dashboards → pipelines → deployment. Dashboards are last because they depend on correct data foundations.
- **Zoom approach decided:** Option A — explicit `zoom_meeting_id` on each `webinar_run` row. No topic filters, no Zoom product type migration, no dedicated account. Operator pastes the Zoom meeting ID when creating a webinar run.
- **Both Zoom product types supported:** `zoom_source_type TEXT CHECK IN ('meeting', 'webinar')` on `webinar_runs` tells the sync which API endpoint to call. Required when `zoom_meeting_id` is set.
- **Multi-day runs:** same Zoom meeting ID for all days — no array of IDs needed.
- **Per-project Zoom credentials:** `projects.zoom_integration_account_id` FK → `integration_accounts`. S2S OAuth credentials (`client_id`, `client_secret`, `account_id`) stored there; token service caches 1h per account.
- **Attendance storage:** `journey_events` table (not a separate `zoom_participants` table) — `source_system = 'zoom'`, `event_type = 'attended'`. Keeps journey UI additive in Phase 2+.
- **`client_secret` encryption at rest required** before Zoom credentials go to production — approach is an open decision.

## New schema additions (from this session)

| Migration | Change |
|-----------|--------|
| 010 | `ghl_connections` table for multi-location GHL routing |
| 011 | `journey_events` table |
| 012 | `webinar_runs`: add `project_id`, `zoom_meeting_id`, `zoom_source_type`; `projects`: add `zoom_integration_account_id` |

## Open questions

- **Ad spend source** — Agency dashboard requires spend data. Manual entry per webinar run? Ad platform API? Spreadsheet upload? Blocks Agency RPC.
- **"Showed" denominator** — % of total leads, registrants, or Zoom attendees? Assumed = Zoom attended; needs sign-off.
- **`client_secret` encryption approach** — AES-256-GCM with env key, or Supabase Vault?
- **Webinar run backfill scope** — On new run creation: re-assign only previously-unassigned contacts, or recalculate all?

## Related wiki

- [[Phase-1-Build-Order]]
- [[Zoom-Integration-Architecture]]
- [[Webinar-Run-Zoom-Linkage]]
- [[Phase-1-Open-Decisions]]
- [[Buyer-Journey-Event-Store]]
- [[Product-Phase-Roadmap]]
- [[GHL-Multi-Location-Architecture]]
- [[Platform-Engineering-Direction]]
