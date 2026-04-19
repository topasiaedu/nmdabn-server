# Dashboard Architecture Redesign — All-Runs Column Table

**Date:** 2026-04-13
**Type:** Agent implementation note (two-session summary)
**Covers:** Previous session (dashboard redesign, 15 tasks) + current session (debug / backfill fix)

---

## Context

This document records the complete "Dashboard Architecture Redesign" that was planned and
implemented across two sessions. The prior art was a per-run filtered view (user picks one
webinar run + date range → dashboard shows data for that run). The goal was to replace it with
an **all-runs column table** where every past run for the selected project appears as a column,
labeled by date (e.g. "Mar 4"), so trends are visible without switching runs.

At the same time the project selector was moved from the dashboard filter bar into the global
navigation bar, and the hardcoded "occupation" breakdown field was replaced with a per-project
configurable `traffic_breakdown_fields` JSONB column.

---

## Part 1 — Database migrations

### Migration 019 — `traffic_breakdown_fields` column

File: `docs/database/migrations/019_traffic_breakdown_fields.sql`

Adds a JSONB column to `public.projects`:

```sql
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS traffic_breakdown_fields JSONB;
```

Each entry in the array: `{ "field_key": "string", "label": "string" }`.
This replaces the previous single `traffic_occupation_field_key TEXT` column for configuring
which GHL custom fields to display as row breakdowns in the dashboards.

### Migration 020 — four all-runs RPCs

File: `docs/database/migrations/020_all_runs_rpcs.sql`

Creates four `CREATE OR REPLACE FUNCTION` RPCs, each returning flat rows that the Node.js API
layer pivots into column-table format:

| Function | Signature (key inputs) | Returns per row |
|---|---|---|
| `get_traffic_all_runs` | `p_project_id, p_workspace_id, p_line_tags TEXT[] DEFAULT NULL` | `run_id, run_start_at, section_key, section_label, row_label, lead_count` |
| `get_showup_all_runs` | `p_project_id, p_workspace_id` | `run_id, run_start_at, section_key, section_label, row_label, attended, total` |
| `get_buyer_behavior_all_runs` | `p_project_id, p_workspace_id` | `run_id, run_start_at, section, label, count, pct` |
| `get_agency_all_runs` | `p_project_id, p_workspace_id` | `run_id, run_start_at, agency_line, leads, showed, buyers, showup_rate, conv_rate` |

All four functions share a common pattern:
- `guard` CTE: validates `project_id + workspace_id` match and fetches `ghl_location_id`, `breakdown_fields`.
- `project_runs` CTE: `FROM webinar_runs WHERE project_id = g.project_id` — all runs for the project.
- Data joins: `ghl_contacts ON webinar_run_id + location_id`; `ghl_contact_custom_field_values` for breakdown values.
- `LANGUAGE SQL STABLE SECURITY DEFINER`.

`get_traffic_all_runs` always returns a `lead_source` section (UTM/session attribution) plus one section per configured `traffic_breakdown_fields` entry. When `p_line_tags` is non-null, only contacts whose `ghl_contact_tags` overlap the array are counted.

`get_showup_all_runs` uses `journey_events` (source_system = 'zoom', event_type = 'attended') to determine the `attended` count. **Known issue (fixed in migration 021):** when `traffic_breakdown_fields` is empty the `CROSS JOIN field_ids` produces 0 rows.

`get_agency_all_runs` uses `traffic_agency_line_tags` JSONB from the project to determine which tag arrays define each agency line.

### Migration 021 — ShowUp RPC fallback

File: `docs/database/migrations/021_showup_rpc_fallback.sql`

`CREATE OR REPLACE` replacement for `get_showup_all_runs` that adds an `effective_fields` CTE:
- When `field_ids` is non-empty: behaves identically to migration 020.
- When `field_ids` is empty (no breakdown fields configured): synthesises a single
  `('total', 'All Contacts', NULL)` row, so the LEFT JOIN with `ghl_contact_custom_field_values`
  is skipped and every contact is grouped under `row_label = 'All'`.

---

## Part 2 — TypeScript types

File: `src/database.types.ts`

Added:
- `traffic_breakdown_fields: Json | null` to `ProjectRow`, `Insert`, `Update`.
- Function definitions for all four RPCs under `Functions` (input args + return type).

---

## Part 3 — Global project state (`ProjectContext`)

File: `src/lib/project-context.tsx`

New React Context + Provider:
- `ProjectProvider` wraps the root layout (added to `app/layout.tsx`).
- Uses `useSupabaseSession` for `accessToken` + `loggedIn`.
- On login: fetches `/api/workspaces` → takes first workspace (single workspace per account assumed for Phase 1).
- Fetches `/api/projects?workspace_id=…` for that workspace.
- Restores `projectId` from `localStorage` key `nmdabn_project_id`; defaults to first project.
- Exports: `workspaceId`, `workspaceName`, `projects`, `projectId`, `setProjectId`, `selectedProject`, `loading`, `error`.
- Hook: `useProjectContext()`.

---

## Part 4 — Navigation + DashboardShell changes

### NavTabs.tsx

- Removed local workspace/project selection logic (moved to `ProjectContext`).
- Added project selector dropdown in the center of the nav bar, visible when logged in
  and not on a `/settings` route.
- Renders project names from `useProjectContext().projects`.

### DashboardShell.tsx

- Removed: workspace dropdown, project dropdown, webinar run dropdown, date range inputs,
  sync button — entire horizontal filter bar removed.
- Now reads `workspaceId`, `projectId`, `selectedProject` from `useProjectContext()`.
- `DashboardContext` now includes `projectBreakdownFields` but no longer includes
  `webinarRunId`, `webinarRunLabel`, `dateFrom`, `dateTo`.

### DashboardContext.ts

Updated type:

```typescript
export type DashboardContext = {
  accessToken: string;
  workspaceId: string;
  workspaceName: string;
  projectId: string;
  projectName: string;
  projectAgencyLineTags: Record<string, string[]> | null;
  projectBreakdownFields: Array<{ field_key: string; label: string }> | null;
  ghlLocationId: string | null;
};
```

Removed: `webinarRunId`, `webinarRunLabel`, `dateFrom`, `dateTo`.

---

## Part 5 — ColumnTable component + pivot utilities

### `src/lib/all-runs-pivot.ts`

Utility module:
- `formatRunDate(isoString)` → `"Mar 4"` format.
- `buildRunColumns(rows)` → deduped, ordered `RunColumn[]` from flat RPC rows.
- `pivotCountRows(flatRows, columns)` → `ColumnTableSection[]`.
- Exports interfaces: `RunColumn`, `ColumnTableRow`, `ColumnTableSection`, `AllRunsPayload`.

### `src/components/ColumnTable.tsx`

Reusable component accepting `{ columns: RunColumn[], sections: ColumnTableSection[] }`:
- Horizontally scrollable table with sticky left label column and sticky header.
- Last column is "TOTAL" (sum across all runs).
- Per-section header rows.
- `showPercentToggle` prop to toggle percentage view.
- Handles `isRate` (percentage formatting) and `isSubRow` (indented label) flags.

---

## Part 6 — API route rewrites

All four dashboard routes rewritten. Old routes used `webinar_run_id + date_from + date_to`.
New routes use `project_id` only (plus optional `line` for traffic).

| Route | Old RPC | New RPC | Node pivot logic |
|---|---|---|---|
| `app/api/dashboard/traffic/route.ts` | `get_traffic_dashboard` | `get_traffic_all_runs` | `buildRunColumns` + `pivotCountRows` |
| `app/api/dashboard/showup/route.ts` | `get_showup_stats` | `get_showup_all_runs` | Custom pivot: Leads, Showed, Show-up % rows |
| `app/api/dashboard/buyer-behavior/route.ts` | `get_buyer_behavior_stats` | `get_buyer_behavior_all_runs` | Custom pivot: DYD, breakdown, program, purchase |
| `app/api/dashboard/agency/route.ts` | `get_agency_stats` | `get_agency_all_runs` | Custom pivot: per-agency-line section with metrics |

Deleted: `app/api/dashboard/traffic/lines/route.ts` (no longer needed).

---

## Part 7 — Dashboard page rewrites

All four pages (`TrafficDashboardPage`, `ShowUpDashboardPage`, `BuyerBehaviorDashboardPage`,
`AgencyDashboardPage`) rewritten to:
1. Fetch the all-runs API (no run/date params).
2. Render `<ColumnTable columns={payload.columns} sections={payload.sections} />`.
3. Show a loading spinner while fetching, an error card on failure, an empty state card
   when `payload.sections.every(s => s.rows.length === 0)`.

Traffic page retains the `activeLine` state (All / NM / OM) pill toggle, which is appended
to the API call as `?line=NM`.

---

## Part 8 — Project settings update

### `app/settings/projects/[id]/page.tsx`

Traffic tab changes:
- Removed single "Occupation Field Key" text input.
- Added dynamic key-value editor: list of `{ field_key, label }` entries.
- Supports add / remove row; saves as `traffic_breakdown_fields` JSON array.

### `app/api/projects/[id]/route.ts`

PATCH route now accepts `traffic_breakdown_fields` (array of `{field_key, label}`).

---

## Part 9 — Debug session: contacts with no `webinar_run_id`

**Symptom:** Traffic dashboard showed "No traffic data found" even after all migrations and code
changes were in place. API returned HTTP 200 with empty sections.

**Investigation:**
1. RPC returns 200 → migrations 019, 020 are applied ✓
2. Direct RPC call via service role key → 0 rows returned
3. Project exists with correct `workspace_id` ✓
4. 21 webinar runs have `project_id = <CAE project ID>` ✓
5. Check `ghl_contacts.webinar_run_id` → ALL NULL for all 5,061 contacts

**Root cause:** The bulk GHL sync (`runGhlFullContactSyncForConnectionId` spawns
`scripts/sync-ghl-contacts-to-supabase.mjs`) does NOT call
`backfill_webinar_runs_for_location` after completing. Only the live webhook handler
(`src/services/ghl-webhook-post.ts`) calls `assignNextWebinarRunForContactId` per-contact.
So contacts imported via bulk sync never get `webinar_run_id` assigned.

**Immediate fix:** Called `backfill_webinar_runs_for_location('OjRihR4hKrEVcA3qJMfk')`
directly via Supabase REST API with service role key → 5,061 contacts updated.

**Code fix:** `app/api/actions/sync/ghl/route.ts` — after `runGhlFullContactSyncForConnectionId`
completes, call:
```typescript
await supabase.rpc("backfill_webinar_runs_for_location", {
  p_location_id: row.ghl_location_id,
});
```
`ghl_connections` query updated from `select("id")` to `select("id, ghl_location_id")`.

---

## Part 10 — Status of each dashboard after backfill

| Dashboard | RPC rows | Status | Blocker |
|---|---|---|---|
| Traffic | 174 | ✅ Working | — |
| Show Up | 0 (before mig 021) | ⏳ Needs migration 021 | No breakdown fields configured → CROSS JOIN returns 0 rows |
| Agency | 0 | ❌ Config mismatch | `traffic_agency_line_tags` uses `lead_nm`/`lead_om` but actual GHL tags are `pd_optin`, `pd_optin_3d_*` etc. |
| Buyer Behavior | 0 | ❌ No data | No orders in DB; `ghl_orders` table empty for CAE |

---

## Key files touched

```
docs/database/migrations/019_traffic_breakdown_fields.sql      (new)
docs/database/migrations/020_all_runs_rpcs.sql                 (new)
docs/database/migrations/021_showup_rpc_fallback.sql           (new)
src/database.types.ts                                          (updated)
src/lib/project-context.tsx                                    (new)
src/lib/all-runs-pivot.ts                                      (new)
src/components/ColumnTable.tsx                                 (new)
src/components/DashboardContext.ts                             (updated)
src/components/DashboardShell.tsx                              (updated — filter bar removed)
src/components/NavTabs.tsx                                     (updated — project selector added)
app/layout.tsx                                                 (updated — ProjectProvider added)
app/api/dashboard/traffic/route.ts                             (rewritten)
app/api/dashboard/showup/route.ts                              (rewritten)
app/api/dashboard/buyer-behavior/route.ts                      (rewritten)
app/api/dashboard/agency/route.ts                              (rewritten)
app/api/dashboard/traffic/lines/route.ts                       (deleted)
app/api/actions/sync/ghl/route.ts                              (updated — backfill call added)
app/api/projects/[id]/route.ts                                 (updated — breakdown_fields in PATCH)
app/settings/projects/[id]/page.tsx                            (updated — breakdown fields editor)
src/features/traffic/TrafficDashboardPage.tsx                  (rewritten)
src/features/showup/ShowUpDashboardPage.tsx                    (rewritten)
src/features/buyer-behavior/BuyerBehaviorDashboardPage.tsx     (rewritten)
src/features/agency/AgencyDashboardPage.tsx                    (rewritten)
```
