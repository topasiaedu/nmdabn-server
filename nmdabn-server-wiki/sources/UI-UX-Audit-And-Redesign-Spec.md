# UI/UX Audit and Redesign Spec

**Raw:** `raw/sources/2026-04-14-ui-ux-audit-and-redesign-spec.md`  
**Date:** 2026-04-14  
**Scope:** All live pages — dashboards + settings — of the Next.js app post Phase 1 build.

## Summary

Full professional UI/UX audit of the NM Media dashboard app conducted via live browser review and code inspection. Identifies 4 critical issues (break the product), 5 major issues, and 6 moderate issues. Provides precise redesign specifications for 12 items (R1–R12), including an exact component-level design system, navigation redesign, settings information architecture overhaul, and per-dashboard UX improvements.

**Key context clarification:** This app serves **NM Media** (the company), not just CAE. NM Media manages multiple client brands — CAE, Dr Jasmine, CMC, and others — each as a separate Project in the system. All design decisions must support this multi-brand, multi-project operator workflow.

## Key facts

- **C1:** Settings is unreachable — no link in the nav. Users must type `/settings` manually.
- **C2:** Settings pages fail silently with "Invalid or expired token" — no auth guard, no fallback login form.
- **C3:** All empty states (no workspace, no project, no run, no data) are silent — no guidance, no CTAs.
- **C4:** Traffic dashboard renders an editable project settings form inline — config must be removed from data views.
- **M1:** Visual design has zero brand identity — no colour, no icons, inconsistent/missing button styles.
- **M2:** Sign Out button is the first element users see after the nav — should be in a user dropdown in the nav.
- **M3:** Settings IA is wrong for multi-brand: Webinar Runs are global (all projects mixed), Zoom credential taxonomy is ambiguous (workspace-level vs project-level not communicated).
- **M4:** No sync trigger in the UI — `POST /api/actions/sync/ghl` and `POST /api/actions/sync/zoom` have no UI button.
- **M5:** Selector bar (workspace/project/run/dates) is a vertical stacked form card — should be a horizontal filter strip.

## Redesign specs (summary)

| ID | What | Key decision |
|----|------|---|
| R1 | Nav: add Settings gear + user avatar dropdown | Settings link top-right; Sign Out inside avatar dropdown |
| R2 | SettingsShell: auth guard for all settings pages | Login form if token missing/expired; SettingsContext for token sharing |
| R3 | Filter bar: horizontal strip + sync button + empty state banners | Sync trigger in UI; amber banners with CTAs when no project/run |
| R4 | Remove project settings form from Traffic dashboard | Config belongs in `/settings`, not in dashboards |
| R5 | Full visual design system | Indigo-600 primary, lucide-react icons, 3 button variants, table styles, KPI card anatomy |
| R6 | Settings IA: sidebar + project tabs (Overview / GHL / Zoom / Webinar Runs / Traffic Config) | Project-centric navigation; Webinar Runs scoped per-project; Zoom taxonomy explained |
| R7 | Webinar Runs form: field help text + improved inputs | Placeholders, helper text, timezone select, Zoom source type radio toggle |
| R8 | Per-dashboard empty states with sync CTAs | Surface-specific messages; inline Zoom sync / GHL sync triggers |
| R9 | KPI card strip on Show Up / Agency / Buyer Behavior / Traffic | 3–4 stat cards above the detail table |
| R10 | Traffic line filter: pill toggles from project config | Auto-populated from `traffic_agency_line_tags`; no free-text input |
| R11 | Per-page document titles | Format: `[Page] — NM Media` |
| R12 | Last-synced timestamp in filter bar | Derived from max `synced_at` on `ghl_contacts` for the workspace |

## Open questions

- R12: Is a `workspace_sync_log` table worth creating for accurate last-synced tracking, or is deriving from `ghl_contacts.synced_at` sufficient for Phase 1?
- R6: Should the Settings sidebar persist selected project between page navigations, or always open to the last-used tab?

## Related

- [[App-Navigation-Structure]] — nav redesign detail
- [[Settings-IA-Redesign]] — sidebar layout and project tab structure
- [[UI-Design-System]] — colour tokens, component variants, table styles
- [[Dashboard-UX-Patterns]] — filter bar, empty states, KPI cards
- [[Phase-1-Build-Order]] — Phase 1 completion checklist
- [[Platform-Engineering-Direction]] — tech stack context
- `../src/components/NavTabs.tsx`
- `../src/components/DashboardShell.tsx`
- `../app/settings/page.tsx`
