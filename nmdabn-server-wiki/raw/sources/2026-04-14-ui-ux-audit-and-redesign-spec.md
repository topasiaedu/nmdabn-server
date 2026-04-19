# UI/UX Audit and Redesign Spec — NM Media Dashboard

**Date:** 2026-04-14  
**Author:** AI agent (UX audit session with Stanley)  
**Scope:** All pages of the live Next.js app at `http://localhost:3000` — dashboards + settings. Includes live browser screenshots and code review of `DashboardShell.tsx`, `NavTabs.tsx`, all `/app/settings/*` pages, and all `/src/features/*/` dashboard pages.

---

## Context

This app is an **internal analytics platform for NM Media**, a company that manages multiple client brands (CAE, Dr Jasmine, CMC, and others). Each brand is a **Project**. Each project runs recurring webinar-based sales funnels. The platform gives NM Media operators a single place to monitor funnel performance across all brands and all webinar runs.

The four dashboard surfaces are:
1. **Traffic** — lead acquisition (GHL contacts)
2. **Show Up** — webinar attendance rates (Zoom + GHL contact tags)
3. **Agency** — per-agency-line KPIs (OM, NM, etc.)
4. **Buyer Behavior** — DYD funnel, occupation mix, purchase facts

Data is pulled from GHL (GoHighLevel) via webhooks + scheduled sync, and from Zoom via S2S OAuth participant reports.

User base: 5–15 internal NM Media operators. Not public-facing.

---

## Audit findings — critical (break the product)

### C1 — Settings is unreachable from the app nav

The nav renders exactly 4 tab links (Traffic, Show Up, Agency, Buyer Behavior). There is no link to `/settings` anywhere. Users must type the URL. This means operators cannot access project configuration, GHL connections, Zoom credentials, or webinar run management without knowing the URL in advance.

### C2 — Settings pages fail silently with "Invalid or expired token"

All `/settings/*` pages depend on `localStorage.getItem("auth_token")` via `getAuthHeaders()`. There is no auth guard. If the token is expired or the user navigates to settings before visiting a dashboard (which is where DashboardShell runs and stores the token), the page renders with a red "Invalid or expired token" message and no actionable guidance.

Confirmed: `/settings/projects/[id]` and `/settings/zoom` both exhibit this behaviour.

### C3 — Empty states give no guidance

When a user first logs in:
- No workspace: selector shows "No workspaces" — no explanation, no CTA
- No project: selector shows "No projects" — no explanation, no CTA
- No webinar run: selector shows "No runs for this project" — no explanation, no CTA
- Data table empty after run selected: no message at all

A new operator has no indication of what to do or where to go.

### C4 — Traffic dashboard renders project settings form inline

The Traffic dashboard page renders an editable "Project settings" form (GHL location id, occupation field key, line tags JSON) directly inside the dashboard view. This conflates configuration with data presentation, looks broken, and puts raw JSON editing inside what should be a read-only report surface.

---

## Audit findings — major (severely damage usability)

### M1 — Visual design is unfinished

- Pure `#F1F5F9` background, white cards, grey borders throughout — zero brand identity
- Nav tabs are plain text links with minimal active-state differentiation
- Buttons have no consistent style — some are `bg-slate-800`, some are unstyled default browser buttons (e.g. "Save Zoom account" on `/settings/zoom` renders with zero CSS classes)
- Form labels look like captions, not labels
- No icons used anywhere
- Checkbox for "Set as default" on Zoom credentials page floats disconnected from its label
- No loading skeletons — just text "Loading…" or nothing

### M2 — Sign Out button is misplaced

Rendered as the first element below the nav, above the workspace selector. This is both visually wrong (first CTA on the page is a destructive action) and structurally wrong (it should live in a user menu in the nav).

### M3 — Settings information architecture is wrong for a multi-brand company

Current structure:
```
/settings
  Zoom Credentials   ← workspace-level
  Webinar Runs       ← all projects mixed together
  Projects list
    [project]        ← project-specific config
```

The Zoom credentials taxonomy creates confusion: are "Zoom Credentials" workspace-wide or per-project? The two-tier model (workspace Zoom account + project Zoom assignment) is invisible. The Webinar Runs page mixes all projects' runs in one table, breaking the per-brand mental model.

### M4 — No sync trigger in the UI

There is a `POST /api/actions/sync/ghl` endpoint and a `POST /api/actions/sync/zoom` endpoint. Neither has a UI trigger. Operators have no way to refresh data from inside the app — they would need to run CLI commands or make raw HTTP requests.

### M5 — Workspace/project selector bar is a vertical stacked form

The workspace, project, webinar run, and date range controls are stacked vertically in a card that looks identical to a settings form. Visually it is not clear these are filter/context controls for the dashboard below.

---

## Audit findings — moderate (friction and confusion)

### Mo1 — No per-page document titles
Every page has `<title>NMDABN dashboards</title>`. Browser tabs are indistinguishable.

### Mo2 — Traffic dashboard "line" filter is a raw text input
The line selector is a free-text `<input>` — users must know what to type (e.g. "OM", "NM"). Should be derived from the project's `traffic_agency_line_tags` config and rendered as toggle pills.

### Mo3 — Date inputs use browser-native datetime-local
Renders inconsistently across browsers. No clear "All time" default state.

### Mo4 — Webinar Runs form has 9 fields with zero guidance
"Format", "Location ID (GHL)", "Zoom source type" — none have placeholder text or helper text explaining what to enter or where to find the values.

### Mo5 — Dashboard data tables have no KPI summary layer
All four dashboards go straight into raw data tables. No high-level summary cards. Users must read tables to understand overall performance.

### Mo6 — No last-synced timestamp anywhere
There is no indicator of when data was last refreshed, making it impossible to know if the numbers are current.

---

## Redesign specifications

### R1 — Nav redesign

**Structure:** Sticky 56px header bar. `background: white`, `border-bottom: 1px solid #E2E8F0`.

**Left zone:** NM Media wordmark (`font-bold text-slate-900 text-base`) → `|` divider → 4 dashboard tab links. Active tab: `color: #4F46E5`, `border-bottom: 2px solid #4F46E5`. Inactive: `text-slate-500`, hover `text-slate-800`.

**Right zone:** "Setup" link (gear icon from lucide-react + "Setup" label, `text-slate-500 hover:text-slate-800 text-sm`) → user avatar button (circle, user's first initial, `bg-indigo-100 text-indigo-700`). Avatar opens a dropdown: user email (read-only) + red "Sign out" button.

**When inside `/settings/*`:** Left zone still shows 4 dashboard tabs. Right zone shows "← Dashboards" link in place of Setup gear.

**Sign Out:** Removed from `DashboardShell` JSX. Lives only in the avatar dropdown.

### R2 — SettingsShell auth guard component

New `src/components/SettingsShell.tsx` that wraps all settings page content.

On mount:
1. Read `auth_token` from `localStorage`. If missing/empty: render a Supabase email/password login form (same as DashboardShell's login form, same styling). On successful login: store token, render settings content.
2. If token found: attempt `GET /api/workspaces`. If 401: clear localStorage, show login form with message "Your session expired. Sign in again."
3. Once authenticated: provide token and workspace_id via `SettingsContext` to all child pages. Settings pages stop calling `getAuthHeaders()` directly and consume context instead.

### R3 — Filter bar redesign

**Replace** the vertical card with a horizontal filter strip directly below the nav. `background: white`, `border-bottom: 1px solid #E2E8F0`, `padding: 12px 24px`.

Single-row layout (wraps on narrow viewports):
- Workspace selector (~180px): compact dropdown, `text-xs uppercase tracking-wide text-slate-400` label above
- Project selector (~180px): same style
- Webinar Run selector (~240px): shows `display_label` as primary text, event date as secondary line `text-xs text-slate-400`
- Date From / Date To: compact date inputs right-aligned, ghost "All time" when empty, `✕` clear button when set
- **Sync button** (far right): secondary button, refresh icon, tooltip "Trigger GHL sync". On click: spinner → success/error toast. Calls `POST /api/actions/sync/ghl`.

**Empty state handling within the filter bar:**
- `projects.length === 0`: inline amber banner below the project selector: "No projects — [→ Go to Setup]"
- `runsForProject.length === 0` and project is selected: inline amber banner: "No webinar runs for [Project Name] — [→ Add a webinar run]"

### R4 — Remove project settings form from Traffic dashboard

Delete the "Project settings" section from `TrafficDashboardPage.tsx` entirely. Replace with an inline amber banner when GHL location is not configured: "GHL not configured for this project. [→ Project settings]"

### R5 — Visual design system

**Colour tokens:**
- Primary action: `indigo-600` (#4F46E5)
- Page background: `slate-50` (#F8FAFC)
- Surface: `white`
- Border: `slate-200`
- Text primary: `slate-900`
- Text secondary: `slate-500`
- Text muted: `slate-400`
- Success: `emerald-600`
- Warning: `amber-500`
- Error/destructive: `red-600`
- Dashboard accent colours: Traffic=`sky-600`, Show Up=`violet-600`, Agency=`emerald-600`, Buyer Behavior=`orange-600`

**Button variants (three, applied everywhere):**
- Primary: `bg-indigo-600 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-indigo-700 focus:ring-2 focus:ring-indigo-500 disabled:opacity-50`
- Secondary: `bg-white border border-slate-200 text-slate-700 rounded-lg px-4 py-2 text-sm font-medium hover:bg-slate-50`
- Destructive: `bg-red-600 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-red-700`

**Input fields:** `bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 w-full`

**Cards:** `bg-white rounded-xl border border-slate-200 shadow-sm`

**Tables:** `thead` with `bg-slate-50`; `th` as `text-xs font-semibold uppercase tracking-wide text-slate-500 py-3 px-4 text-left`; `td` as `text-sm text-slate-700 py-3 px-4`; alternating rows `even:bg-slate-50/50`; `border-b border-slate-100`. Numeric cells right-aligned monospace. Rate cells: coloured badge `>=70%` emerald, `40–70%` amber, `<40%` red.

**Icons:** Install `lucide-react`. Use: `Settings` for setup link, `RefreshCw` for sync, `AlertTriangle` for warning banners, `CheckCircle` for success, `BarChart2`/`Users`/`TrendingUp`/`ShoppingCart` for dashboard tabs.

**Section headings:**
- Page title: `text-2xl font-bold text-slate-900`
- Section title: `text-sm font-semibold uppercase tracking-wide text-slate-400 mb-3`
- Card heading: `text-base font-semibold text-slate-800`

### R6 — Settings information architecture (sidebar + project tabs)

**Layout:** Two-panel. Left sidebar 240px wide (sticky, `bg-white border-r border-slate-200`). Right content area fills remaining width.

**Sidebar sections:**

```
NM Media Settings          ← sidebar heading

WORKSPACE
  [Settings icon] General
  [Key icon]      Integrations

PROJECTS
  [dot] CAE
  [dot] Dr Jasmine
  [dot] CMC
  [plus] New project
```

Active sidebar item: `bg-indigo-50 text-indigo-700 rounded-lg font-medium`. Inactive: `text-slate-600 hover:bg-slate-50`.

**General page:** Workspace name (view-only), workspace ID with copy button (needed for cron job config).

**Integrations page:** Title "Zoom Accounts". Info box at top (`bg-indigo-50 border border-indigo-200 rounded-lg p-4 text-sm text-indigo-800`): "These are workspace-level Zoom API credentials. After adding an account here, go to a project's settings to assign it." Existing list + create form (restyled with proper button variants).

**Per-project pages — 5 tabs:**

Tab 1: **Overview** — project name (editable), description. Status summary cards: GHL (green ✓ Connected / red ✗ Not configured), Zoom (Assigned / Not assigned), Webinar Runs count.

Tab 2: **GHL Connection** — GHL location ID field + private integration token (password input with show/hide toggle). "Test connection" button. If connected: card showing location ID, Active/Inactive badge, created date, "Remove" destructive button.

Tab 3: **Zoom** — Dropdown to select from workspace Zoom accounts. If none exist: amber banner "No Zoom accounts yet — [→ Add Zoom account]" linking to Integrations sidebar item.

Tab 4: **Webinar Runs** — CRUD table scoped to this project only (not global). Columns: Label, Date, Format, Active toggle, Zoom ID, Actions (edit/delete). "New run" button opens a slide-over panel. Form fields with help text (see Mo4 fix below).

Tab 5: **Traffic Config** — Occupation field ID and key. Agency line tags as an editable key-value table (rows of: Line name input + GHL tag input + remove row button + add row button at bottom) rather than raw JSON textarea. On save: serialised to JSON and stored in `projects.traffic_agency_line_tags`.

**New project:** Clicking "[+ New project]" opens a minimal modal: project name input + Create button. On creation: new project appears in sidebar, user navigated to its Overview tab.

### R7 — Webinar Runs form field help text

Per field (applies inside the slide-over panel on the Webinar Runs tab):
- **Display label** — placeholder `"e.g. CAE Full Day — 12 Apr 2026"` — helper: "Used as the run label across all dashboards."
- **Format** — placeholder `"e.g. Full Day, Half Day, Masterclass"` — helper: "Descriptive format name for grouping."
- **Event start/end** — helper: "Scheduled start/end time in local timezone. Set timezone below."
- **Location ID (GHL)** — placeholder `"e.g. abc123xyz"` — helper: "Found in GHL → Settings → Business Info → Location ID."
- **Timezone** — replace free text with searchable select pre-loaded with common timezones (Asia/Kuala_Lumpur, Asia/Singapore, America/New_York, Europe/London, UTC). Helper: "Controls how event times are displayed."
- **Zoom Meeting ID** — placeholder `"e.g. 12345678901"` — helper: "Numeric ID from the Zoom URL. Leave blank to skip Zoom sync for this run."
- **Zoom source type** — labelled radio toggle: `[● Meeting] [○ Webinar]`. Helper: "Select 'Webinar' only if created as a Zoom Webinar product, not a regular meeting."
- **Active** — pill toggle switch (styled checkbox). Label: "Active — include this run in dashboard data."

### R8 — Dashboard empty states (per surface)

**Show Up — no data after run selected:**
White card, centred, `violet-300` icon (Users), text: "No attendance data found for this run. Make sure Zoom sync has been triggered after the webinar ended." + primary button "[→ Trigger Zoom sync]" that calls `POST /api/actions/sync/zoom` with current `webinarRunId`.

**Agency — no data:**
White card, `emerald-300` icon (BarChart2): "No agency data found. Check that agency line tags are configured for this project." + link "[→ Project Traffic Config]".

**Buyer Behavior — no data:**
White card, `orange-300` icon (ShoppingCart): "No purchase data found. Make sure GHL sync is up to date." + button "[→ Trigger GHL sync]".

**Traffic — no data:**
White card, `sky-300` icon (Users): "No leads found. Check your GHL connection and run a sync." + link "[→ Project settings]".

### R9 — KPI card strip on dashboards

Each dashboard opens with a row of 3–4 stat cards above the detail table. Cards: `bg-white rounded-xl border border-slate-200 shadow-sm p-5`, in `grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6`.

Card anatomy:
```
[icon, 20px, coloured]
TOTAL LEADS              ← text-xs uppercase tracking-wide text-slate-400
1,248                    ← text-3xl font-bold text-slate-900
```

**Show Up cards:** Total Leads, Overall Show Up Rate (%), Best Performing Line (highest rate).
**Agency cards:** Total Leads, Total Buyers, Blended Conversion Rate (%), Lowest Show Up Line.
**Buyer Behavior cards:** Total Students, Total Buyers, Buyer Conversion Rate (%), Top Program.
**Traffic cards:** Total Leads, Top Occupation, Top Source/Line.

### R10 — Traffic "line" selector → pill toggles

Replace the free-text `<input>` line filter with a row of toggle pill buttons. Available lines derived from the selected project's `traffic_agency_line_tags`. Includes an "All" pill (default selected). Clicking a pill filters the table to that line only. Styling: selected pill `bg-indigo-100 text-indigo-700 border border-indigo-300`, unselected `bg-white text-slate-600 border border-slate-200 hover:bg-slate-50`.

### R11 — Per-page document titles

Each page sets `document.title` via `useEffect`:
- `/` → `"Traffic — NM Media"`
- `/showup` → `"Show Up — NM Media"`
- `/agency` → `"Agency — NM Media"`
- `/buyer-behavior` → `"Buyer Behavior — NM Media"`
- `/settings` → `"Settings — NM Media"`
- `/settings/projects/[id]` → `"[Project Name] — Settings — NM Media"`
- `/settings/zoom` → moved inside Settings sidebar as "Integrations"

### R12 — Last-synced timestamp

Add `last_synced_at` display in the filter bar (below or beside the Sync button): `text-xs text-slate-400 "Last synced: [relative time]"`. Source: could be a new `workspace_sync_log` table or simply the most recent `updated_at` from `ghl_contacts` for the current workspace. For Phase 1, derive from the max `synced_at` on `ghl_contacts` (already a column on that table).

---

## Implementation priority order

| Priority | Item | Key files |
|---|---|---|
| P0 | R1 — Nav redesign + Settings link + user dropdown | `NavTabs.tsx`, `layout.tsx`, `DashboardShell.tsx` |
| P0 | R2 — SettingsShell auth guard | new `SettingsShell.tsx`, all `/app/settings/*` pages |
| P0 | R3 — Filter bar redesign + empty state banners | `DashboardShell.tsx`, all dashboard pages |
| P0 | R4 — Remove project settings from Traffic dashboard | `TrafficDashboardPage.tsx` |
| P1 | R5 — Full visual design system | `globals.css`, all page and component files, `package.json` (add lucide-react) |
| P1 | R6 — Settings IA sidebar + project tabs | all `/app/settings/*` pages (significant restructure) |
| P1 | R8 — Empty states per dashboard | all `*DashboardPage.tsx` files |
| P2 | R7 — Webinar Runs form help text + field improvements | Webinar Runs slide-over inside Settings |
| P2 | R9 — KPI card strip | all `*DashboardPage.tsx` files |
| P2 | R10 — Traffic pill toggle | `TrafficDashboardPage.tsx` |
| P2 | R11 — Per-page titles | all page files |
| P2 | R12 — Last synced timestamp | `DashboardShell.tsx` or filter strip component |
