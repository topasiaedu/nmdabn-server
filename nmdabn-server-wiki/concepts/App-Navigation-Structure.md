# App Navigation Structure

## Definition / scope

Defines the global navigation shell for the NM Media Dashboard — the persistent header present on every page, how users move between dashboards and settings, and where authentication actions (sign in/out) live. Supersedes the current `NavTabs.tsx` + `DashboardShell.tsx` structure which has no settings link.

---

## Current state (problems)

`src/components/NavTabs.tsx` renders 4 plain text links (Traffic, Show Up, Agency, Buyer Behavior) in a 44px strip. There is no link to `/settings`. Sign Out is rendered inside `DashboardShell.tsx` as a plain unstyled `<button>` above the workspace selector — the first interactive element visible on every dashboard page.

Result: users cannot reach settings, and the first thing they see below the nav is a sign-out button.

---

## Target nav structure

### Overall layout

Sticky 56px header bar. `bg-white border-b border-slate-200 shadow-none`. Present on **all** pages including settings.

### Left zone

1. **NM Media wordmark** — `text-base font-bold text-slate-900`, links to `/`
2. **Divider** — `w-px h-5 bg-slate-200 mx-4`
3. **Dashboard tab links** — Traffic, Show Up, Agency, Buyer Behavior

Tab link styling:
- Active: `text-indigo-600 border-b-2 border-indigo-600 font-medium` (border sits at the bottom edge of the nav bar)
- Inactive: `text-slate-500 hover:text-slate-800 font-normal`
- All tabs: `text-sm px-1 py-4` (the py-4 makes the border-bottom reach the nav edge)

Each tab has a small lucide icon to the left of the label (16px, same colour as text):
- Traffic: `Users`
- Show Up: `BarChart2`
- Agency: `TrendingUp`
- Buyer Behavior: `ShoppingCart`

### Right zone

Flex row, items-center, gap-3, pushed to the right via `ml-auto`.

1. **Setup link** (when on a dashboard page):
   ```
   flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900 px-3 py-2 rounded-lg hover:bg-slate-100
   ```
   Icon: `Settings` (lucide-react, 16px). Label: "Setup". Links to `/settings`.

2. **User avatar button**:
   ```
   w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 text-sm font-semibold flex items-center justify-center cursor-pointer hover:ring-2 hover:ring-indigo-300
   ```
   Shows first initial of the user's email. On click: toggles a small dropdown panel.

3. **User dropdown panel** (absolute positioned, `top-12 right-0 w-56 bg-white rounded-xl border border-slate-200 shadow-lg z-50 p-2`):
   - User email: `text-xs text-slate-500 px-3 py-2 truncate` (read-only)
   - Divider: `border-t border-slate-100 my-1`
   - Sign Out button: `w-full text-left text-sm text-red-600 hover:bg-red-50 rounded-lg px-3 py-2 font-medium`

### When inside `/settings/*`

Left zone: same NM Media wordmark → divider → 4 dashboard tab links (unchanged — so user can navigate back to any dashboard instantly without a "back" button).

Right zone: replace Setup link with a "← Dashboards" ghost link (`text-sm text-slate-500 hover:text-slate-800`). User avatar dropdown stays.

---

## Component changes required

### `src/components/NavTabs.tsx`

Full rewrite. Currently just 4 `<Link>` elements. New version:
- Imports `usePathname` (already used) and lucide-react icons
- Renders the full two-zone nav bar described above
- Manages dropdown open/close state (`useState<boolean>`)
- Receives `userEmail: string | null` and `onSignOut: () => void` as props (passed down from layout or DashboardShell)

### `app/layout.tsx`

Currently passes no props to `<NavTabs />`. After the change it needs to supply `userEmail` and `onSignOut`. Since these come from the Supabase session (which is managed in `DashboardShell`), the cleanest approach is to hoist session state slightly:

Option A (recommended for Phase 1 simplicity): `NavTabs` manages its own Supabase session read via `useSupabaseSession` hook internally. This makes it self-contained and avoids prop-drilling through `layout.tsx`.

Option B: Create a `SessionContext` at the layout level. More correct long-term but more work.

Use Option A for Phase 1.

### `src/components/DashboardShell.tsx`

Remove the Sign Out button (`<button type="button" onClick={onSignOut}>Sign out</button>`) and the toolbar `<div>` wrapping it. The sign-out action is now exclusively in the nav avatar dropdown.

Keep `onSignOut` as an internal callback for `NavTabs` to call (via the `useSupabaseSession` hook or passed via context).

---

## URL → active tab mapping

| URL prefix | Active tab |
|---|---|
| `/` | Traffic |
| `/showup` | Show Up |
| `/agency` | Agency |
| `/buyer-behavior` | Buyer Behavior |
| `/settings/*` | None (no tab underline); Setup link replaced by ← Dashboards |

---

## Related

- [[UI-Design-System]] — colour tokens, button and icon specs used here
- [[Dashboard-UX-Patterns]] — filter bar sits below this nav
- [[Settings-IA-Redesign]] — what users see when they click Setup
- `../src/components/NavTabs.tsx` — file to rewrite
- `../src/components/DashboardShell.tsx` — remove Sign Out from here
- `../app/layout.tsx` — root layout that mounts NavTabs
