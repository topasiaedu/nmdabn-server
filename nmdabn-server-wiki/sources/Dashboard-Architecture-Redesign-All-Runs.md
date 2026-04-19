# Dashboard Architecture Redesign — All-Runs Column Table

**Raw:** `raw/sources/2026-04-13-dashboard-architecture-redesign-all-runs.md`
**Repo:** `docs/database/migrations/019_traffic_breakdown_fields.sql`, `020_all_runs_rpcs.sql`, `021_showup_rpc_fallback.sql`

## Summary

Full architectural overhaul of all four dashboards (Traffic, Show Up, Agency, Buyer Behavior)
carried out in two sessions on 2026-04-13. The core shift:

- **Before:** User selects a project + a single webinar run + date range → dashboard shows data for that run only.
- **After:** User selects a project (globally, in the nav bar) → all runs for that project appear as columns in a single table, labeled by date ("Mar 4", "Aug 28", …).

The hardcoded "occupation" breakdown field was replaced with a per-project configurable
`traffic_breakdown_fields` JSONB column. The filter bar was removed from `DashboardShell`.

A critical data bug was found and fixed in the same session: all 5,061 contacts had
`webinar_run_id = null` because the bulk GHL sync never called the backfill RPC.

## Key facts

- **Migrations:** 019 (adds `traffic_breakdown_fields` column), 020 (four all-runs RPCs), 021 (ShowUp RPC fallback for empty breakdown fields).
- **New React Context:** `src/lib/project-context.tsx` — `ProjectProvider` at root layout; `useProjectContext()` hook; restores selection from `localStorage`.
- **New ColumnTable component:** `src/components/ColumnTable.tsx` — sticky header, sticky label column, TOTAL column, rate/sub-row support.
- **Pivot utility:** `src/lib/all-runs-pivot.ts` — `buildRunColumns`, `pivotCountRows`, `formatRunDate`.
- **All API routes rewritten:** `traffic`, `showup`, `buyer-behavior`, `agency` — no longer accept `webinar_run_id`, `date_from`, `date_to`; call new RPCs with `project_id + workspace_id` only.
- **All dashboard pages rewritten:** render `<ColumnTable>` fed by the new APIs.
- **Sync backfill fix:** `app/api/actions/sync/ghl/route.ts` now calls `backfill_webinar_runs_for_location` after every full contacts sync.
- **TypeScript:** `src/database.types.ts` updated for new column and four RPC function signatures.

## Notable tables / facts

### All-runs RPC pattern (shared guard CTE)

```sql
guard AS (
  SELECT p.id AS project_id, p.ghl_location_id,
         COALESCE(p.traffic_breakdown_fields, '[]'::JSONB) AS breakdown_fields
  FROM public.projects p
  WHERE p.id = p_project_id AND p.workspace_id = p_workspace_id
),
project_runs AS (
  SELECT wr.id AS run_id, wr.event_start_at AS run_start_at
  FROM public.webinar_runs wr CROSS JOIN guard g
  WHERE wr.project_id = g.project_id
)
```

### Backfill bug

`backfill_webinar_runs_for_location(p_location_id TEXT)` sets `ghl_contacts.webinar_run_id`
to the first `webinar_runs` row where `event_start_at > contact.date_added` (for the same
`location_id`). Only the live webhook handler called this; bulk sync did not.
Fix: the sync route now calls it via `supabase.rpc(...)` after contact sync completes.

### Dashboard status after fix (CAE project, 2026-04-13)

| Dashboard | Status | Requirement |
|---|---|---|
| Traffic | ✅ 174 RPC rows | — |
| Show Up | ⏳ Run migration 021 | Config: breakdown fields optional |
| Agency | ❌ Wrong tags | `lead_nm`/`lead_om` tags not present; actual: `pd_optin`, `pd_optin_3d_*` |
| Buyer Behavior | ❌ No orders | `ghl_orders` empty for CAE |

## Open questions

- Should the ShowUp RPC aggregate view ("All Contacts") persist as the default even after breakdown fields are configured, as a summary row?
- What are the correct GHL tag names for NM/OM lines in CAE? (`traffic_agency_line_tags` needs updating in project settings.)
- When will order data be synced for CAE (unlocking Buyer Behavior)?

## Related

- [[All-Runs-Column-Table]] — new dashboard paradigm
- [[Project-Context-Global-State]] — global project selector
- [[Traffic-Breakdown-Fields]] — configurable breakdown system
- [[Webinar-Run-Contact-Assignment]] — backfill pattern and fix
- [[Dashboard-UX-Patterns]] — superseded filter bar spec (see Conflict note)
- `../docs/database/migrations/019_traffic_breakdown_fields.sql`
- `../docs/database/migrations/020_all_runs_rpcs.sql`
- `../docs/database/migrations/021_showup_rpc_fallback.sql`
- `../src/lib/project-context.tsx`
- `../src/components/ColumnTable.tsx`
- `../src/lib/all-runs-pivot.ts`
