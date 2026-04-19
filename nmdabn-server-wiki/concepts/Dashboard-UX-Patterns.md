# Dashboard UX Patterns

> **Conflict / superseded (2026-04-13):** The filter bar, Webinar Run selector, and Date Range
> selector described in this document were **removed** in the Dashboard Architecture Redesign.
> The project selector moved into the global nav bar ([[Project-Context-Global-State]]).
> Dashboards now show all runs as columns ([[All-Runs-Column-Table]]). The "Level 3: No webinar
> run" and "Level 5: Date range" empty states no longer apply.
> The KPI card strip, pill toggles, empty state hierarchy (Level 1, 2, 4), and page title
> specs below remain valid as design intent (some implemented, some pending).

## Definition / scope

Defines the UX patterns used across all four dashboard pages (Traffic, Show Up, Agency, Buyer Behavior): the horizontal filter bar, empty state hierarchy, KPI stat card strip, table layout, and sync trigger UI. Sits below the nav bar defined in [[App-Navigation-Structure]]. Supersedes the current `DashboardShell.tsx` vertical card layout.

---

## Current state (problems)

- Workspace / Project / Webinar Run / Date Range controls are stacked vertically in a card identical to a settings form — indistinguishable from config UI
- Sign Out button appears above the selector card
- No empty state guidance when selectors show "No projects" or "No runs"
- No sync trigger UI
- No KPI summary — every dashboard goes straight into a raw table
- Traffic dashboard renders editable project settings form inline
- "Line" filter on Traffic is a raw free-text `<input>`

---

## Filter bar

### Layout

Directly below the nav bar (no gap). `bg-white border-b border-slate-200`. Height: auto (wraps on narrow screens). `px-6 py-3`.

### Contents (left to right)

```
[Workspace ▾]  [Project ▾]  [Webinar Run ▾]  ·  [Date from]  →  [Date to]  [✕]  ···  [⟳ Sync]
```

**Workspace selector:**
- Label: `text-xs font-semibold uppercase tracking-wide text-slate-400` above the select
- `<select>` styled per [[UI-Design-System]] input spec, width `~180px`
- Options: `{workspace.name} ({workspace.role})`

**Project selector:**
- Same style, width `~180px`
- Options: `{project.name}`
- When `projects.length === 0`: option text "No projects" + render an amber inline banner below the entire filter bar (see Empty States below)

**Webinar Run selector:**
- Width `~240px`
- Options: `{run.display_label}` with event date as secondary `text-xs text-slate-400` — rendered as a custom dropdown or via `<optgroup>` / `option` with a data attribute and custom CSS if simple `<select>` is used
- When `runsForProject.length === 0` and a project is selected: render amber banner (see Empty States)

**Date range:**
- Two `<input type="date">` compact fields, width `~130px` each. When both empty: show a ghost placeholder "All time" via `::placeholder`
- Clear button `[✕]` (ghost icon button, `X` from lucide-react, 14px) appears only when at least one date is set. Clears both fields.
- `text-xs` label "From" / "To" above each input

**Sync button (far right):**
- Secondary small button variant: `bg-white border border-slate-200 text-slate-600 rounded-lg px-3 py-1.5 text-xs font-medium hover:bg-slate-50 flex items-center gap-1.5`
- Icon: `RefreshCw` (lucide-react, 14px). Animates to `animate-spin` while syncing.
- Label: "Sync"
- Tooltip (title attribute): "Trigger full GHL sync for this workspace"
- On click: calls `POST /api/actions/sync/ghl` with `Authorization: Bearer {token}` and `X-Workspace-Id: {workspaceId}` headers
- On success: show success toast (bottom-right, `bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm rounded-lg shadow px-4 py-3`, auto-dismiss after 4s)
- On error: show error toast (same position, `bg-red-50 border border-red-200 text-red-800`)
- Below the Sync button: `text-xs text-slate-400` "Last synced: [relative time]" derived from `max(ghl_contacts.synced_at)` for the current workspace (fetched once on workspace selection, refreshed after successful sync)

### Responsive

On narrow viewports (`< 768px`): selectors stack vertically into two columns (workspace/project on row 1, webinar run full-width on row 2, dates on row 3, sync button row 4).

---

## Empty state hierarchy

Empty states appear below the filter bar as amber banners. Each state replaces/supplements the dashboard content area. They are mutually exclusive — show the first applicable one.

### Level 1: No workspace

Replace entire page content (below filter bar) with a centred panel:
```
[Building icon, 48px, slate-300]
You haven't been added to a workspace yet.
Contact your NM Media admin to get access.
```

### Level 2: No project in workspace

Amber banner below filter bar (full width):
```
[AlertTriangle icon, 16px, amber-500]  No projects configured for this workspace.
Set up your first project to start tracking.   [Setup →]
```
"Setup →" is a primary small button linking to `/settings`.

### Level 3: No webinar run for selected project

Amber banner below filter bar:
```
[AlertTriangle icon]  No webinar runs for "{Project Name}".
A webinar run is required to load dashboard data.   [→ Add a webinar run]
```
"→ Add a webinar run" links to `/settings/projects/[projectId]?tab=runs`.

### Level 4: Run selected, no data returned from RPC

Per-dashboard white card, centred icon + text, primary action button. Shown inside the dashboard content area when the API returns an empty array.

**Traffic — no data:**
```
[Users icon, 40px, sky-200]
No leads found for this run.
Check your GHL connection is active and a sync has been run.
[→ Project Settings]   [⟳ Trigger GHL Sync]
```

**Show Up — no data:**
```
[BarChart2 icon, 40px, violet-200]
No attendance data found for this run.
Trigger a Zoom sync after the webinar ends to load attendance.
[→ Project Settings]   [⟳ Trigger Zoom Sync]
```
"Trigger Zoom Sync" calls `POST /api/actions/sync/zoom` with `{ webinar_run_id: webinarRunId }` in the body.

**Agency — no data:**
```
[TrendingUp icon, 40px, emerald-200]
No agency data found.
Check that agency line tags are configured for this project.
[→ Traffic Config]
```
"Traffic Config" links to `/settings/projects/[projectId]?tab=traffic`.

**Buyer Behavior — no data:**
```
[ShoppingCart icon, 40px, orange-200]
No purchase data found for this run.
Make sure GHL sync is up to date.
[⟳ Trigger GHL Sync]
```

### Level 5: Date range filters out all data

Small muted card (not full empty state):
```
text-sm text-slate-500: "No data in the selected date range. Try clearing the date filters."
```
With a ghost "Clear dates" link that resets both date inputs.

---

## KPI stat card strip

Appears between the filter bar and the detail table on Show Up, Agency, Buyer Behavior, and Traffic dashboards. Grid of 3–4 cards. See [[UI-Design-System]] for card anatomy.

**Data source:** derived from the same RPC response already fetched for the table. Computed client-side with `useMemo`.

### Traffic cards (from `get_traffic_stats` or equivalent)
1. Total Leads — sum of all rows
2. Top Source — the line with most leads
3. Top Occupation — most common occupation value

### Show Up cards (from `get_showup_stats`)
1. Total Leads — `SUM(denominator)`
2. Total Showed — `SUM(numerator)`
3. Overall Show Up Rate — `SUM(numerator) / SUM(denominator)` formatted as `%`, coloured badge
4. Best Line — the bucket with highest `showup_rate` (show line name + rate)

### Agency cards (from `get_agency_stats`)
1. Total Leads — `SUM(leads)`
2. Total Buyers — `SUM(buyers)`
3. Blended Conversion Rate — `SUM(buyers) / SUM(leads)` as `%`, coloured badge
4. Weakest Show Up — agency line with lowest `showup_rate`

### Buyer Behavior cards (from `get_buyer_behavior_stats`)
Derived from rows where `section = 'dyd'`:
1. Total Students — `bigint_val` where `label = 'Total student pax'`
2. Total Buyers — from `section = 'purchase'`, `label = 'Distinct buyers'`
3. Buyer Conversion Rate — buyers / total students
4. Top Program — `section = 'program'`, row with highest `bigint_val`

---

## Traffic "line" selector → pill toggles

Replaces the current free-text `<input>` line filter.

**Placement:** between the filter bar and the KPI card strip (or between the KPI cards and the table — whichever is cleaner in implementation).

**Data source:** derived from the selected project's `traffic_agency_line_tags` config. The project object (already fetched in DashboardShell) carries this JSON column. Parse it client-side to extract the list of line names (keys of the JSON object, e.g. `["OM", "NM"]`). Always include an implicit "All" option.

**Rendering:**
```
[All] [OM] [NM] [MISSING]
```

Each pill:
- Selected: `bg-indigo-100 text-indigo-700 border border-indigo-300 rounded-full px-3 py-1 text-xs font-medium`
- Unselected: `bg-white text-slate-600 border border-slate-200 rounded-full px-3 py-1 text-xs font-medium hover:bg-slate-50`

"All" is selected by default (no filter applied). Clicking a specific line deselects "All" and filters. Clicking "All" clears other selections. Clicking an already-selected line deselects it (if only one selected, revert to "All").

**If `traffic_agency_line_tags` is null or empty:** render only the "All" pill (disabled styling or hidden).

---

## Page title per dashboard

Each dashboard page sets its document title on mount:

```typescript
useEffect(() => {
  document.title = "Traffic — NM Media";
}, []);
```

| Page | Document title |
|------|---------------|
| `/` | `Traffic — NM Media` |
| `/showup` | `Show Up — NM Media` |
| `/agency` | `Agency — NM Media` |
| `/buyer-behavior` | `Buyer Behavior — NM Media` |
| `/settings` | `Settings — NM Media` |
| `/settings/integrations` | `Integrations — NM Media` |
| `/settings/projects/[id]` | `{projectName} — Settings — NM Media` |

---

## Removing project settings from Traffic dashboard

**Current:** `TrafficDashboardPage.tsx` renders an editable "Project settings" section (GHL location id, occupation field, line tags JSON textarea) when the project has incomplete config.

**Target:** Remove that section entirely. Replace with a conditional amber banner (Level 4 empty state style):

```
[AlertTriangle, amber]  GHL is not configured for "{Project Name}".
[→ Go to Project Settings]
```

The banner appears when `project.ghl_location_id` is null/empty. It links to `/settings/projects/[projectId]?tab=ghl`.

The Traffic dashboard component (`TrafficDashboardPage.tsx`) should receive `project` config data from `DashboardShell`'s context — the project object (not just the ID) needs to be included in `DashboardContext` so the component can check `ghl_location_id` without a separate fetch.

---

## DashboardContext additions

`src/components/DashboardContext.ts` needs one addition:

```typescript
export interface DashboardContext {
  accessToken: string;
  workspaceId: string;
  workspaceName: string;       // NEW — for display in Traffic dashboard subtitle
  projectId: string;
  projectName: string;         // NEW — for banners, empty states, page titles
  projectAgencyLineTags: Record<string, string[]> | null;  // NEW — for pill toggle
  ghlLocationId: string | null; // NEW — to detect unconfigured project
  webinarRunId: string;
  webinarRunLabel: string;      // NEW — for display in subtitles
  dateFrom: string | null;
  dateTo: string | null;
}
```

`DashboardShell.tsx` populates these from the already-fetched projects list (project name, ghl_location_id, traffic_agency_line_tags are available in `ProjectItem` — confirm `GET /api/projects` returns these columns and add them if not).

---

## Related

- [[UI-Design-System]] — colour tokens, button variants, card anatomy used here
- [[App-Navigation-Structure]] — nav bar above the filter strip
- [[Settings-IA-Redesign]] — pages linked from empty state CTAs
- [[UI-UX-Audit-And-Redesign-Spec]] — source audit
- `../src/components/DashboardShell.tsx` — filter bar + selectors live here
- `../src/components/DashboardContext.ts` — context type to extend
- `../src/features/traffic/TrafficDashboardPage.tsx` — remove project settings form
- `../src/features/showup/ShowUpDashboardPage.tsx` — add KPI cards + empty state
- `../src/features/agency/AgencyDashboardPage.tsx` — add KPI cards + empty state
- `../src/features/buyer-behavior/BuyerBehaviorDashboardPage.tsx` — add KPI cards + empty state
