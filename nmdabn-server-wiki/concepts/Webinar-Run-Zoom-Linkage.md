# Webinar run → Zoom linkage

## Definition / scope

How a `webinar_runs` row is connected to an actual Zoom meeting or webinar, and how the participant sync service knows which Zoom API endpoint to call and which meeting to fetch.

## The problem

The Zoom account used per project is not exclusively for sales webinars. It also handles team meetings, coaching calls, and other uses. The platform cannot auto-discover which Zoom meetings are sales webinar runs. Filtering by Zoom meeting type (type=5 for Webinar product) does not work because some projects run sales webinars as regular Zoom Meetings (type=2). Topic/name filters are brittle.

## Decision: explicit Zoom ID on webinar_run (Option A)

When an operator creates a `webinar_run` record in the admin UI, they also paste the **Zoom meeting ID** from their Zoom account. The participant sync only fetches participants for `webinar_run` rows that have `zoom_meeting_id IS NOT NULL`. This solves the mixed-use account problem without changing any company workflow.

## Schema additions to webinar_runs (migration 012)

| Column | Type | Constraint | Notes |
|--------|------|------------|-------|
| `project_id` | `UUID` | FK → `projects(id)` | Links run to project (and thus to Zoom account) |
| `zoom_meeting_id` | `TEXT` | nullable | The Zoom meeting or webinar ID to fetch participants for |
| `zoom_source_type` | `TEXT` | `CHECK IN ('meeting', 'webinar')`, nullable | Required when `zoom_meeting_id` is set; controls which API endpoint is used |

`location_id` remains on `webinar_runs` because existing SQL RPCs (007) scope `ghl_contacts` by `location_id`. `project_id` is an addition, not a replacement.

## zoom_source_type — why it is required

The Zoom API has completely different endpoints for meeting vs webinar product reports:

| zoom_source_type | API endpoint |
|-----------------|--------------|
| `meeting` | `GET /v2/report/meetings/{zoom_meeting_id}/participants` |
| `webinar` | `GET /v2/report/webinars/{zoom_meeting_id}/participants` |

Some projects use the Zoom Webinar product; others run sales webinars as regular Meetings. The operator knows which type they created in Zoom. `zoom_source_type` is set at webinar run creation time and drives the sync service's endpoint choice.

## Multi-day runs

A `format = 'multi_day'` webinar run uses a **single** `zoom_meeting_id`. Zoom recurring meetings produce separate meeting instances but share a parent meeting ID that the participant report API accepts. No array of IDs is needed.

## Sync service logic

```
For each webinar_run WHERE zoom_meeting_id IS NOT NULL:
  credentials ← projects.zoom_integration_account_id → integration_accounts
  token ← Zoom S2S token service (cached 1h per account)
  if zoom_source_type = 'meeting':
    fetch GET /v2/report/meetings/{zoom_meeting_id}/participants (paginate)
  else:
    fetch GET /v2/report/webinars/{zoom_meeting_id}/participants (paginate)
  for each participant:
    normalize email (lowercase + trim)
    match to ghl_contacts.email + location_id → get contact_id
    upsert journey_events (idempotent: keyed on zoom_meeting_id + email)
```

See [[Zoom-Integration-Architecture]] for credential chain and token exchange detail. See [[Buyer-Journey-Event-Store]] for the `journey_events` target schema.

## Human workflow

1. Schedule the webinar in Zoom → note the meeting/webinar ID
2. Create `webinar_run` in admin UI: dates, label, paste Zoom ID, select source type
3. System triggers `assign_next_webinar_run_for_contact` backfill for the location
4. After webinar ends: trigger participant sync (manual button or `meeting.ended` webhook)

## Related

- [[Zoom-Integration-Architecture]]
- [[Buyer-Journey-Event-Store]]
- [[Phase-1-Execution-Plan-And-Zoom-Design]]
- `../docs/database/migrations/006_webinar_runs_and_contact_fk.sql` — current schema
- `../docs/database/migrations/012_*.sql` (planned)
- `../docs/database/migrations/007_traffic_dashboard_functions.sql` — assignment RPCs

## Contradictions / history

- The original `webinar_runs` table (migration 006) has no `zoom_meeting_id` or `project_id`. Migration 012 adds these. Decided 2026-04-13.
- Prior notes treated webinar run creation as a manual SQL insert. The admin UI (Step 5 of [[Phase-1-Build-Order]]) replaces this.
