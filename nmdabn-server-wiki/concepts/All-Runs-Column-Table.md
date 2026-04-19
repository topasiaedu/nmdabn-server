# All-Runs Column Table

## Definition / scope

The **all-runs column table** is the dashboard data model introduced in the 2026-04-13
architecture redesign. Instead of a user selecting a single webinar run and seeing one column
of data, all past runs for the selected project appear simultaneously as columns, each labeled
by short date ("Mar 4", "Aug 28", …). A "TOTAL" column is always appended on the right.

This model applies to all four dashboards: Traffic, Show Up, Agency, Buyer Behavior.

---

## How it works here

### Data flow

```
ProjectContext (global)
  └─ selectedProject (project_id, workspace_id)
       └─ Dashboard Page (useEffect on mount + project change)
            └─ GET /api/dashboard/{tab}?project_id=…&workspace_id=…
                 └─ server: supabase.rpc("get_{tab}_all_runs", { p_project_id, p_workspace_id })
                      └─ Postgres: returns flat (run_id, run_start_at, section_key, section_label, row_label, …) rows
                 └─ server: buildRunColumns(rows) + pivotCountRows(rows, columns)
                 └─ JSON: { columns: RunColumn[], sections: ColumnTableSection[] }
            └─ <ColumnTable columns={…} sections={…} />
```

### API contract

All dashboard APIs now require only `project_id + workspace_id` in query params. They no
longer accept `webinar_run_id`, `date_from`, or `date_to`.

### Pivot utilities (`src/lib/all-runs-pivot.ts`)

| Function | Purpose |
|---|---|
| `formatRunDate(isoString)` | Converts `TIMESTAMPTZ` to `"Mar 4"` short form |
| `buildRunColumns(rows)` | Deduplicates and sorts `RunColumn[]` from flat RPC rows |
| `pivotCountRows(flatRows, columns)` | Groups by section, builds one `ColumnTableRow` per label with a value per run column |

### ColumnTable component (`src/components/ColumnTable.tsx`)

Props:
- `columns: RunColumn[]` — ordered list of run columns
- `sections: ColumnTableSection[]` — sections with rows

Features:
- Sticky left label column (min-width set) for row identity
- Sticky header row
- TOTAL column (sum of all run values per row)
- `showPercentToggle` — client-side toggle between raw count and percentage
- `isRate` row flag — renders as `%` (does not sum for TOTAL; uses weighted average or last value)
- `isSubRow` flag — indented label for nested breakdown rows

### RPC section structure

Each RPC returns `section_key` + `section_label` per row, allowing the pivot to group rows.
Example for Traffic (no breakdown fields configured):

```
section_key   section_label       row_label          run_id   lead_count
lead_source   Sorted Lead Source  fb|paid            …        67
lead_source   Sorted Lead Source  ig|paid            …        27
lead_source   Sorted Lead Source  Missing UTM        …        4
```

When breakdown fields are configured (e.g. `field_key = "occupation"`):

```
section_key   section_label   row_label           run_id   lead_count
occupation    Occupation      Full-time Employee   …        42
occupation    Occupation      Self-employed        …        18
occupation    Occupation      Missing              …        7
lead_source   …               …                   …        …
```

---

## Empty state

A dashboard shows the empty state card (`isEmpty = sections.every(s => s.rows.length === 0)`)
when:
- No webinar runs exist with `project_id` matching the selected project.
- All contacts for those runs have `webinar_run_id = null` (backfill not yet run — see [[Webinar-Run-Contact-Assignment]]).
- No data matches the query conditions (e.g. Agency with no matching contact tags).

---

## Related

- [[Dashboard-Architecture-Redesign-All-Runs]] — implementation source note
- [[Project-Context-Global-State]] — supplies `projectId` consumed by each dashboard
- [[Traffic-Breakdown-Fields]] — controls the non-`lead_source` sections in Traffic + ShowUp
- [[Webinar-Run-Contact-Assignment]] — prerequisite: contacts must have `webinar_run_id` set
- [[Dashboard-UX-Patterns]] — superseded by this paradigm (filter bar removed); see Conflict note there
- `../src/lib/all-runs-pivot.ts`
- `../src/components/ColumnTable.tsx`
- `../docs/database/migrations/020_all_runs_rpcs.sql`

## Contradictions / history

- **Supersedes** the single-run filtered view (per-run select → per-run data). The old approach was
  designed before multi-run trending was a product requirement.
- The original `Dashboard-UX-Patterns` spec described a horizontal filter bar with Workspace /
  Project / Webinar Run / Date Range selectors. That bar **no longer exists** in the codebase
  as of 2026-04-13.
