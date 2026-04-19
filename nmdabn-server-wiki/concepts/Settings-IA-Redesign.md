# Settings Information Architecture Redesign

## Definition / scope

Defines the complete restructured information architecture for `/settings/*` — the operator configuration area of the NM Media Dashboard. Covers authentication guard, layout (sidebar + content), page structure per section, and per-field form guidance. Supersedes the current flat single-column settings pages.

---

## Current state (problems)

1. `/settings` is unreachable from the nav (no link).
2. All settings pages fail silently when `localStorage` auth token is missing or expired.
3. "Zoom Credentials" at the top level and "Zoom account dropdown" inside project settings creates ambiguity about whether Zoom credentials are workspace-level or per-project.
4. "Webinar Runs" is a top-level menu item showing ALL runs from ALL projects mixed together — breaks the multi-brand mental model.
5. Layout is a single-column page with no persistent navigation between settings sections.

---

## SettingsShell auth guard

**New component:** `src/components/SettingsShell.tsx`

All `/app/settings/**` pages replace their top-level `<div>` with `<SettingsShell>`. This component:

1. On mount: reads `auth_token` from `localStorage`.
2. If token missing or empty: renders a centred login card (same Supabase `signInWithPassword` form as `DashboardShell`, same styling from [[UI-Design-System]]). On successful login: stores token + workspace_id to localStorage, renders children.
3. If token present: fires `GET /api/workspaces` as a liveness check. On 401: clears `auth_token` from localStorage, renders login card with amber banner "Your session expired. Please sign in again."
4. On success: provides `{ accessToken, workspaceId }` via `SettingsContext` (React context) to all child pages.

Child settings pages consume `SettingsContext` instead of calling `getAuthHeaders()` directly. `src/lib/settings-api.ts` (`getAuthHeaders()`) is deprecated for settings pages — kept only for legacy or standalone use.

---

## Two-panel layout

Every `/settings/*` page uses a two-panel shell:

```
┌─────────────────────────────────────────────────────────────┐
│  [Nav bar — full width, from App-Navigation-Structure]      │
├───────────────────┬─────────────────────────────────────────┤
│                   │                                         │
│   Left sidebar    │   Right content area                    │
│   240px wide      │   flex-1, p-8, max-w-3xl                │
│   bg-white        │   bg-slate-50                           │
│   border-r        │                                         │
│   sticky top-14   │                                         │
│                   │                                         │
└───────────────────┴─────────────────────────────────────────┘
```

**New component:** `src/components/SettingsSidebar.tsx`

---

## Left sidebar structure

```
NM Media Settings           ← text-base font-bold text-slate-900, px-4 pt-6 pb-4

─── WORKSPACE ───            ← text-xs font-semibold uppercase tracking-wide text-slate-400, px-4 py-2

  [Settings icon]  General   ← sidebar nav item
  [Key icon]       Integrations

─── PROJECTS ───             ← same eyebrow style

  [Circle icon]    CAE        ← one item per project, loaded from API
  [Circle icon]    Dr Jasmine
  [Circle icon]    CMC
  ...

  [Plus icon]  New project    ← always at bottom of projects list, text-indigo-600
```

**Sidebar nav item styling:**
- Active: `flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium bg-indigo-50 text-indigo-700`
- Inactive: `flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900`

**New project action:** clicking "[+ New project]" opens a small modal overlay (not a page navigation). Modal: project name input + primary "Create" button + secondary "Cancel". On create: calls `POST /api/projects`, adds to sidebar list, navigates to new project's Overview tab.

---

## Right content: General page (`/settings`)

**URL:** `/settings` (replaces current flat list)

Content:
- Page title: "Workspace Settings"
- Card: workspace name (display-only for now), workspace ID with copy-to-clipboard button (needed for Render cron `SYNC_WORKSPACE_ID` env var — add a note explaining this)

---

## Right content: Integrations page (`/settings/integrations`)

**URL:** `/settings/integrations` (replaces `/settings/zoom`)

Page title: "Zoom Accounts"

**Info banner at top** (`bg-indigo-50 border border-indigo-200`):
"Zoom accounts are workspace-level credentials. After adding an account here, go to a project's Zoom tab to assign it for webinar attendance syncing."

**Existing accounts list:** same table as current `/settings/zoom` but restyled per [[UI-Design-System]] table spec. Columns: Display name, Account ID (truncated), Default (badge), Created, Actions (Delete).

**Add Zoom account form:** below the list. Same fields as current. "Save Zoom account" button uses primary button style.

---

## Right content: Per-project pages (`/settings/projects/[id]`)

### 5-tab interface

Tab bar sits below the page title: `text-sm font-medium`, active tab `text-indigo-600 border-b-2 border-indigo-600`, inactive `text-slate-500 hover:text-slate-800`. Tabs: Overview | GHL Connection | Zoom | Webinar Runs | Traffic Config.

### Tab 1: Overview

- Project name: editable text input + "Save" primary button
- Project description: optional textarea + "Save" (or combined save for name + description)
- **Status summary** — 3 status indicator cards in a row:

```
┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
│ GHL Connection   │  │ Zoom Account     │  │ Webinar Runs     │
│ ✓ Connected      │  │ ✗ Not assigned   │  │ 0 runs           │
│ loc_abc123       │  │ [→ Assign]       │  │ [→ Add run]      │
└──────────────────┘  └──────────────────┘  └──────────────────┘
```

- GHL Connected: `bg-emerald-50 border-emerald-200`, icon `CheckCircle text-emerald-600`
- Not configured: `bg-amber-50 border-amber-200`, icon `AlertTriangle text-amber-500`

### Tab 2: GHL Connection

**If no connection exists:**
- GHL Location ID: text input, placeholder `"e.g. abc123xyz"`, helper "Found in GHL → Settings → Business Info → Location ID."
- Private Integration Token: password input with show/hide toggle (`Eye`/`EyeOff` icons), placeholder `"Paste token here"`, helper "Generated in GHL → Settings → Integrations → Private Integration Token."
- "Save GHL Connection" primary button. On save: encrypts token via `POST /api/projects/[id]/connections/ghl`, shows success banner.

**If connection exists:**
- Card showing: Location ID, Created date, Active/Inactive toggle.
- "Remove connection" destructive button (with confirmation dialog: "This will disconnect GHL sync for this project. Are you sure?").

### Tab 3: Zoom

- Dropdown: "Zoom account for this project" — populated from workspace Zoom accounts. `<select>` with options from `GET /api/integrations/accounts?provider=zoom`.
- If no workspace Zoom accounts exist: amber banner "No Zoom accounts configured yet. [→ Add a Zoom account]" linking to `/settings/integrations`.
- "Save" primary button.
- Helper below: "The selected Zoom account will be used for attendance syncs on all webinar runs in this project."

### Tab 4: Webinar Runs

**URL stays at** `/settings/projects/[id]?tab=runs` (query param drives tab, not a separate route)

Replaces the current global `/settings/webinar-runs` page. Shows only runs for this project.

**Table columns:** Label, Event Date, Format, Active (toggle), Zoom ID, Actions (edit pencil, delete trash)

**"New run" button** (primary, top-right of section): opens a **slide-over panel** from the right (not a new page, not an inline form). The slide-over is `fixed inset-y-0 right-0 w-full max-w-lg bg-white shadow-xl z-50` with an overlay behind it.

**Slide-over form fields** (see [[UI-UX-Audit-And-Redesign-Spec]] R7 for full field-by-field guidance):
- Display label — placeholder + helper text
- Format — placeholder + helper text
- Event start/end — datetime-local inputs + helper
- Location ID (GHL) — placeholder + helper (note: pre-filled from project's GHL connection if set)
- Timezone — searchable `<select>` with common timezones: Asia/Kuala_Lumpur, Asia/Singapore, Asia/Tokyo, Australia/Sydney, Europe/London, America/New_York, UTC
- Zoom Meeting ID — optional, placeholder + helper
- Zoom source type — radio toggle `[● Meeting] [○ Webinar]` + helper
- Active — pill toggle switch
- Sort order — optional number input + helper

**Inline edit:** clicking the pencil icon on a row opens the same slide-over pre-filled with that run's data. "Update" button instead of "Create".

**Delete:** clicking trash icon shows a `window.confirm`-style inline confirmation row below the row (not a browser dialog). "Confirm delete" destructive small button + "Cancel" ghost button.

### Tab 5: Traffic Config

- **Occupation field ID:** text input, helper "The GHL custom field ID for the occupation field (UUID format)."
- **Occupation field key/name:** text input, helper "The field's API key name, e.g. `contact.occupation`."
- **Agency line tags:** replaced from raw JSON textarea to an editable key-value table:

```
Line name   │  GHL Tag(s)           │
────────────┼───────────────────────┤
OM          │  lead_om              │ [✕]
NM          │  lead_nm              │ [✕]
[+ Add line]
```

Each row: text input for line name + text input for tag (or comma-separated tags) + remove row button. "Add line" appends a blank row. On save: serialised to `{"OM":["lead_om"],"NM":["lead_nm"]}` JSON and stored in `projects.traffic_agency_line_tags`. "Save Traffic Config" primary button.

---

## URL scheme

| URL | Content |
|-----|---------|
| `/settings` | General (workspace overview) |
| `/settings/integrations` | Zoom Accounts (workspace-level) |
| `/settings/projects/[id]` | Project — Overview tab (default) |
| `/settings/projects/[id]?tab=ghl` | Project — GHL Connection tab |
| `/settings/projects/[id]?tab=zoom` | Project — Zoom tab |
| `/settings/projects/[id]?tab=runs` | Project — Webinar Runs tab |
| `/settings/projects/[id]?tab=traffic` | Project — Traffic Config tab |

The old `/settings/zoom` and `/settings/webinar-runs` routes should redirect (302) to their new equivalents: `/settings/integrations` and `/settings/projects/[id]?tab=runs` respectively. Since `/settings/webinar-runs` was global, redirect to `/settings` as a safe fallback.

---

## File changes summary

| Action | File |
|--------|------|
| New | `src/components/SettingsShell.tsx` |
| New | `src/components/SettingsSidebar.tsx` |
| New | `src/lib/settings-context.ts` (SettingsContext type + provider) |
| Rewrite | `app/settings/page.tsx` → General tab |
| New | `app/settings/integrations/page.tsx` (replaces `app/settings/zoom/page.tsx`) |
| Rewrite | `app/settings/projects/[id]/page.tsx` → 5-tab layout |
| Delete | `app/settings/zoom/page.tsx` (replaced by integrations) |
| Delete | `app/settings/webinar-runs/page.tsx` (moved into project tab) |
| Add redirect | `app/settings/zoom/route.ts` → 302 to `/settings/integrations` |
| Add redirect | `app/settings/webinar-runs/route.ts` → 302 to `/settings` |

---

## Related

- [[UI-UX-Audit-And-Redesign-Spec]] — source audit
- [[UI-Design-System]] — all visual styles referenced here
- [[App-Navigation-Structure]] — nav bar that links to these pages
- [[Dashboard-UX-Patterns]] — dashboard side (read-only data views)
- `../app/settings/` — all settings pages to rewrite
- `../src/components/DashboardShell.tsx` — reference for auth pattern to replicate in SettingsShell
