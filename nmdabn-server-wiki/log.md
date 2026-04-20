# Wiki log

Append-only timeline. **New entries go at the bottom.** Heading format: `## [YYYY-MM-DD] kind | Short title` (see [[CLAUDE]]).

## [2026-04-07] system | LLM Wiki bootstrap

- Added vault schema ([[CLAUDE]]), [[index]], folder layout (`raw/sources/`, `concepts/`, `sources/`, `entities/`).
- Replaced default Obsidian `Welcome.md` with [[Home]].

## [2026-04-07] ingest | GHL webhooks (from docs/ghl-webhooks.md)

- Raw: `raw/sources/2026-04-07-repo-ghl-webhooks.md` (copy of `../docs/ghl-webhooks.md`).
- Wiki: [[GHL-Webhooks]], [[GHL-Webhook-Pipeline]], [[Supabase-GHL-Mirror]].
- Updated: [[index]].

## [2026-04-07] ingest | GHL webhooks — depth pass (same raw)

- Goal: match LLM Wiki expectation that **one source fans out** across many interlinked pages (security, middleware, ops, SQL-first context, entity).
- Expanded: [[GHL-Webhooks]] (tables, HTTP matrix, checklist, ops).
- Added: [[GHL-Webhook-Security]], [[Express-Raw-Webhook-Body]], [[GHL-Sync-Operations]], [[SQL-First-Data-Layer]]; expanded [[GHL-Webhook-Pipeline]], [[Supabase-GHL-Mirror]].
- Entity: [[GoHighLevel]]; updated `entities/README.md`.
- Updated: [[Home]] (ingest fan-out note), [[index]].

## [2026-04-07] ingest | Full docs tree pass (current + archive)

- Raw snapshots added for: `docs/README.md`, `docs/database/README.md`, `docs/data-sync-principles.md`, and all files in `docs/archive/`.
- Source pages added: [[Docs-README]], [[Database-README]], [[Data-Sync-Principles]], [[Archive-README]], [[Archive-Documentation-Update-Summary]], [[Archive-Projects-And-Docs-Update]].
- Concept added: [[Documentation-Lineage]] to resolve current-vs-historical precedence.
- Updated: [[index]].

## [2026-04-07] ingest | Additional raw notes (sync reliability + multi-location architecture)

- Detected new raw files under `raw/sources/`:
  - `2026-04-07-agent-ghl-contacts-sync-pagination-and-throughput-fix.md`
  - `2026-04-07-agent-multi-location-ghl-architecture-recommendation.md`
- Added source pages:
  - [[GHL-Contacts-Sync-Pagination-And-Throughput-Fix]]
  - [[Multi-Location-GHL-Architecture-Recommendation]]
- Added concept pages:
  - [[GHL-Contacts-Sync-Reliability]]
  - [[GHL-Multi-Location-Architecture]]
- Updated: [[index]].

## [2026-04-08] ingest | Product dashboard spec, phase roadmap, buyer journey

- Raw (already in vault): `2026-04-07-sales-tracking-dashboard-spec-from-sheet-exports.md`, `2026-04-07-phase-roadmap-and-phase-1-dashboard.md`, `2026-04-07-buyer-journey-tracking-zoom-ghl-first-party.md`.
- Source pages: [[Sales-Tracking-Dashboard-Spec-From-Sheet-Exports]], [[Phase-Roadmap-And-Phase-1-Dashboard]], [[Buyer-Journey-Tracking-Zoom-GHL-First-Party]].
- Concepts: [[Sales-Tracking-Dashboard-Model]], [[Product-Phase-Roadmap]], [[Buyer-Journey-Event-Store]].
- Entity: [[Zoom]]; updated `entities/README.md`.
- Index: raw asset inventory for CSV/XLSX/PDF companions.
- Updated: [[index]].

## [2026-04-08] ingest | Engineering and ops direction raw note

- Raw: `raw/sources/2026-04-07-engineering-and-ops-direction.md` — monorepo without `packages/shared`, Render+Docker, modular monolith vs microservices, webhook spike / async pattern, VAPI out of scope, per-project creds (incl. future WhatsApp/closing), job-queue hygiene.
- Updated: [[index]].

## [2026-04-08] ingest | Engineering and ops direction — wiki completion

- Gap: raw row existed in [[index]] but no `sources/` page yet.
- Added: [[Engineering-And-Ops-Direction]], [[Platform-Engineering-Direction]].
- Updated: [[index]] (source + concept rows).

## [2026-04-13] handoff | Traffic dashboard + Next frontend snapshot

- Raw: `raw/sources/2026-04-13-traffic-dashboard-next-frontend-handoff.md` — paths to migrations, API, Next `frontend/` feature layout, `NEXT_PUBLIC_*` env expectations, local run, no secrets.
- Repo doc touch-up: `docs/traffic-dashboard.md` (frontend env subsection).
- Repo hygiene: `frontend/.gitignore` (exclude `.next/`, `node_modules/`, local env).
- Updated: [[index]] (raw catalog row).

## [2026-04-13] ingest | Next.js consolidation decision + migration architecture

- Raw: `raw/sources/2026-04-13-nextjs-consolidation-decision.md` — decision to replace Express with Next.js Route Handlers; rationale (event-driven ingestion model, no continuous polling needed); directory structure before/after; full route map; migration patterns (raw body, auth helpers, params, env, CORS removal); merged package.json; Dockerfile.
- Source page added: [[NextJS-Consolidation-Decision]].
- Concept page added: [[NextJS-Consolidation-Architecture]] — full agent implementation guide for the migration step.
- Concept page updated: [[Platform-Engineering-Direction]] — superseded "separate Express + Next.js" with "single Next.js app, one Render service." Added contradiction note.
- Concept page updated: [[Phase-1-Build-Order]] — inserted "Migration Step" between Step 1 (✅ done) and Step 2; updated Steps 3, 4, 5, 7, 9, 10 to reflect Next.js patterns; added data refresh model section; removed CORS as a concern in Step 3.
- Updated: [[index]] (raw row, source row, two updated concept summaries, one new concept row).

## [2026-04-13] review | Step 3 infrastructure hygiene post-review + smoke test

- Migration 013 applied: `client_secret` → `client_secret_encrypted`, `api_secret` → `api_secret_encrypted` on `integration_accounts`; RLS enabled with service_role bypass + workspace policies.
- `integration-accounts-api.ts` safe-column constant centralized across all 4 account routes.
- Zoom create route now encrypts `client_secret` with AES-256-GCM before storage.
- `env.ts` validates + warns on `GHL_CONNECTION_TOKEN_ENCRYPTION_KEY` at startup; `encryptionKeyLoaded` flag added.
- Jobs routes stubbed to 501 cleanly.
- `database.types.ts` regenerated; TypeScript 0 errors.
- Smoke tests all passing.
- Pre-existing RLS recursion issue on `workspace_members` noted (non-blocking, security maintained).
- Updated: [[Phase-1-Build-Order]] (Step 3 marked ✅ DONE).

## [2026-04-13] review | Step 2 schema post-review + smoke test

- Verified migrations 011 and 012 applied to live Supabase DB.
- `src/database.types.ts` regenerated; TypeScript 0 errors.
- Live write/read tests: `journey_events` INSERT+DELETE, `webinar_runs` with all new Zoom columns, `projects.zoom_integration_account_id` — all passing.
- **Fix:** added service_role bypass policy to migration 011 (consistency with migration 010; no functional impact).
- Updated: [[Phase-1-Build-Order]] (Step 2 marked ✅ DONE).

## [2026-04-13] review | Migration Step post-review + smoke test

- Reviewed agent-executed Next.js migration against [[NextJS-Consolidation-Architecture]] spec.
- All 8 smoke test routes passing (health, GHL webhook, auth guard on all protected routes, Google 501).
- TypeScript: 0 errors (`tsc --noEmit`).
- **Fixes applied:**
  - `.env.example` — real AES-256 key replaced with empty placeholder + generation instruction (security).
  - `env.ts` — removed vestigial `frontendOrigin`, `server.port`; made `GOOGLE_*` vars optional (returns 501).
  - `app/api/auth/google/authorize/route.ts`, `callback/route.ts` — guard against `env.google === undefined`; `oauth2Client` moved inside handler (not module-level); added `export const runtime = "nodejs"`.
- **Watch-outs for future steps documented in [[Phase-1-Build-Order]]:**
  - `scripts/` must be explicitly copied in Docker standalone build (wiki Dockerfile already correct).
  - `integration_accounts.client_secret` stored in plaintext — encrypt in Step 3 / Step 4 (same as `ghl_connections` pattern).
- Updated: [[Phase-1-Build-Order]] (Migration Step marked ✅ DONE; post-migration fixes + smoke test results recorded).

## [2026-04-13] review | Step 9 post-review + smoke test

- `app/api/actions/sync/ghl/route.ts` — `POST`; workspace-scoped; resolves active `ghl_connections` via project → workspace chain; calls `runGhlFullContactSyncForConnectionId` + `runGhlFullOrdersInvoicesSyncForConnectionId` sequentially; returns `{ success: true, triggered: N }`.
- Verified `runGhlFullContactSyncForConnectionId` and `runGhlFullOrdersInvoicesSyncForConnectionId` exist and pass `--connection-id` to the existing MJS scripts.
- No body → 400 (expected; body parser before auth); fake token with body → 401. TypeScript: 0 errors.
- Updated: [[Phase-1-Build-Order]] (Step 9 marked ✅ DONE).

## [2026-04-13] review | Step 8 post-review

- `app/layout.tsx` — NavTabs added; metadata updated.
- `src/components/NavTabs.tsx` — `"use client"` with `usePathname` active-tab highlighting.
- `src/components/DashboardShell.tsx` — shared login + selectors shell; localStorage sync for settings pages; render-prop API.
- `src/components/DashboardContext.ts` — shared context type.
- `src/features/traffic/TrafficDashboardPage.tsx` — refactored to use DashboardShell.
- `src/features/traffic/types/index.ts` — `WebinarRunListItem` added.
- `src/features/traffic/services/api.ts` — `fetchWebinarRuns` added.
- Show Up / Agency / Buyer Behavior — full feature stacks (types, service, page component).
- TypeScript: 0 errors; 0 lint warnings.
- **Fix:** `postcss.config.mjs` updated for Tailwind v4 (`@tailwindcss/postcss` plugin, `autoprefixer` removed); `globals.css` updated to `@import "tailwindcss"` (v4 syntax); `@tailwindcss/postcss` devDependency installed.
- All four pages → 200 with HTML + nav after fix.
- Updated: [[Phase-1-Build-Order]] (Step 8 marked ✅ DONE).

## [2026-04-13] review | Step 7 post-review + smoke test

- `app/api/dashboard/showup/route.ts`, `agency/route.ts`, `buyer-behavior/route.ts` — all follow traffic route pattern; `requireAuthAndWorkspace`; RPC called with `session.workspaceId` (not user query param); generic error messages to client.
- **Fix:** `parseOptionalIsoDateParam` was duplicated in all three files — extracted to `src/lib/parse-date-param.ts` and imported.
- All three routes → 401 without auth. TypeScript: 0 errors.
- Updated: [[Phase-1-Build-Order]] (Step 7 marked ✅ DONE).

## [2026-04-13] review | Step 6 post-review + smoke test

- `docs/database/migrations/014_showup_rpc.sql` — `get_showup_stats`: NM/OM/MISSING buckets always present (unnest LEFT JOIN); safe division; guard join prevents cross-workspace reads; date filter via `COALESCE(date_added, synced_at)`.
- `docs/database/migrations/015_buyer_behavior_rpc.sql` — `get_buyer_behavior_stats`: dyd / dyd_closing (NULL placeholder) / occupation / program (first-touch utm_campaign) / purchase sections; all safe division.
- `docs/database/migrations/016_agency_rpc.sql` — `get_agency_stats`: per agency line from `traffic_agency_line_tags` JSONB keys; `ad_spend`/`cpl`/`cpa` = NULL (open decision #1); returns 0 rows when no line tags configured.
- All three functions applied to live DB; guard with all-zero UUIDs → 0 rows confirmed.
- All column references validated against live DB (no missing columns).
- Updated: [[Phase-1-Build-Order]] (Step 6 marked ✅ DONE).

## [2026-04-14] refactor | NM Media Dashboard UI/UX Redesign (P0-P2)

- Implemented P0 requirements: new `NavTabs`, robust settings authentication via `SettingsShell`, `DashboardContext` data flow.
- Overhauled `DashboardShell` with specific 5-level empty state banners, top filter bar instead of side-bars, and last synced timestamp display per R12.
- Refactored `app/settings/*` to a two-panel 2-column view with sidebar (R6) bridging all multi-brand features under Workspace/Project boundaries.
- Replaced separate Zoom / Webinar runs settings pages with unified `/settings/integrations`.
- Upgraded dashboard visual design (R5): unified card aesthetics, metrics rendering, standard layouts.
- Added KPI parameter strips (R9) to Traffic, ShowUp, Agency, Buyer Behavior.
- Added Line Pill Filters toggle on Traffic Dashboard (R10).
- Fixed unconfigured GHL amber banner in Traffic dashboard (R8).
- Set Document page titles for routing analytics (R11).
- Passed full TypeScript compile with 0 errors via `npx tsc --noEmit`.

## [2026-04-13] review | Step 5 post-review + smoke test

- `app/api/projects/[id]/route.ts` — PATCH extended with `zoom_integration_account_id` (null/""/string pattern).
- `app/api/projects/[id]/connections/ghl/route.ts` — GET list + POST create; encrypts `private_integration_token` → `private_integration_token_encrypted`; returns safe columns only; workspace ownership guard.
- `app/api/webinar-runs/route.ts` — GET (workspace-scoped via project_id IN) + POST (full field validation, ISO timestamp parsing, zoom_source_type enum, workspace ownership check).
- `app/api/webinar-runs/[id]/route.ts` — GET + PATCH (all fields optional, re-validates zoom_source_type, re-verifies workspace on project_id change) + DELETE.
- `src/lib/settings-api.ts` — `getAuthHeaders()` with SSR guard.
- Four settings pages: index, zoom, project [id], webinar-runs — all `"use client"`, Tailwind, full CRUD.
- All 7 new API routes → 401 without auth; TypeScript: 0 errors; no lint warnings.
- Updated: [[Phase-1-Build-Order]] (Step 5 marked ✅ DONE).

## [2026-04-13] review | Step 4 post-review + smoke test

- `src/services/zoom-token.ts` — S2S OAuth exchange, in-memory bearer cache (5-min safety margin, 1-min floor), full error handling; no `any`, no non-null assertions.
- `src/services/zoom-participants-sync.ts` — paginated Zoom Reports API, select-first idempotency per participant email, batch INSERT in chunks of 100, contact resolution by `email + location_id`, writes to `journey_events` with `source_system = 'zoom'`.
- `scripts/sync-zoom-participants.mjs` — standalone MJS mirror of TypeScript service; `npm run sync-zoom-participants` script added to `package.json`.
- `app/api/actions/sync/zoom/route.ts` — auth-gated manual trigger; workspace ownership verified before sync; same 404 for missing/cross-workspace runs.
- `app/api/integrations/accounts/zoom/route.ts` updated — live token exchange before INSERT (400 with Zoom error if credentials rejected).
- `payload->>user_email` PostgREST JSON filter syntax confirmed valid against live DB.
- **Design choice:** Zoom `meeting.ended` webhook skipped for Phase 1 (no Zoom app approval needed); manual trigger is sufficient. Add in Step 9 if automation is required.
- **Future optimization note:** select-first idempotency is N+1 queries per sync run. For high-frequency re-runs, add a unique index on `(webinar_run_id, payload->>'user_email')` in a future migration.
- TypeScript: 0 errors. Both new routes → 401 without auth.
- Updated: [[Phase-1-Build-Order]] (Step 4 marked ✅ DONE; Step 9 updated to note `sync/zoom` route pre-exists).

## [2026-04-14] ingest | UI/UX audit and redesign spec

- Raw: `raw/sources/2026-04-14-ui-ux-audit-and-redesign-spec.md` — full browser audit of live app (all pages), live code review of `DashboardShell.tsx`, `NavTabs.tsx`, all `/app/settings/*` pages.
- **Key context clarification recorded:** This app serves NM Media (a company managing multiple client brands: CAE, Dr Jasmine, CMC, etc.), not just CAE. All design decisions reflect multi-brand operator workflow.
- Critical issues (C1–C4): Settings unreachable from nav; settings pages fail silently with expired token; empty states give no guidance; project settings form rendered inside Traffic dashboard.
- Major issues (M1–M5): Zero visual design identity; Sign Out misplaced; Settings IA wrong for multi-brand; no sync trigger in UI; selector bar looks like a settings form.
- 12 redesign specs (R1–R12) with exact Tailwind classes, component names, and file-level change instructions.
- Source page added: [[UI-UX-Audit-And-Redesign-Spec]].
- Concept pages added: [[UI-Design-System]], [[App-Navigation-Structure]], [[Settings-IA-Redesign]], [[Dashboard-UX-Patterns]].
- Updated: [[index]] (raw source row, source note row, 4 new concept rows).

## [2026-04-13] review | Step 10 — Deployment

- `Dockerfile` — multi-stage node:22-alpine build; copies `.next/standalone`, `.next/static`, `public/`, `scripts/`; `output: "standalone"` confirmed already set in `next.config.ts`.
- `.dockerignore` — excludes secrets, `node_modules`, build artefacts, wiki, docs.
- `render.yaml` — `web` service (Docker, health check `/api/health`, all required env var refs marked `sync: false`); `cron` service `nmdabn-ghl-daily-sync` at `0 2 * * *` UTC (calls `POST /api/actions/sync/ghl` via inline node fetch script; needs `SYNC_HOST`, `SYNC_BEARER_TOKEN`, `SYNC_WORKSPACE_ID`).
- `.env.example` — finalised: all Phase 1 vars present; Google OAuth + legacy single-location vars commented optional; Render cron vars documented.
- Updated: [[Phase-1-Build-Order]] (Step 10 marked ✅ DONE; production checklist added).
- Phase 1 complete.

## [2026-04-13] ingest | Phase 1 execution plan + Zoom / webinar design decisions

- Raw: `raw/sources/2026-04-13-phase1-execution-plan-and-zoom-webinar-design.md` — full project status, agreed build order (10 steps), all Zoom integration decisions, `journey_events` schema, 4 open decisions blocking completion.
- Source page added: [[Phase-1-Execution-Plan-And-Zoom-Design]].
- Concept pages added: [[Zoom-Integration-Architecture]], [[Webinar-Run-Zoom-Linkage]], [[Phase-1-Build-Order]], [[Phase-1-Open-Decisions]].
- Concept page updated: [[Buyer-Journey-Event-Store]] — added decided migration 011 schema table; updated Zoom ingest path (manual export superseded by S2S API); added "Showed" definition and open decision link.
- Contradictions resolved: [[Buyer-Journey-Event-Store]] previously noted "manual export acceptable in Phase 1" — superseded by S2S API decision made 2026-04-13.
- Updated: [[index]] (raw catalog row, source row, four new concept rows, updated Buyer-Journey-Event-Store summary).

## [2026-04-13] ingest | Dashboard architecture redesign — all-runs column table

- Raw: `raw/sources/2026-04-13-dashboard-architecture-redesign-all-runs.md`
- Covers two sessions: (1) full 15-task dashboard redesign implementing migrations 019–021, ProjectContext, ColumnTable, pivot utilities, API rewrites, dashboard page rewrites, and project settings update. (2) Debug session finding and fixing the bulk-sync backfill omission (5,061 contacts with `webinar_run_id = null`).
- Source page added: [[Dashboard-Architecture-Redesign-All-Runs]]
- Concept pages added: [[All-Runs-Column-Table]], [[Project-Context-Global-State]], [[Traffic-Breakdown-Fields]], [[Webinar-Run-Contact-Assignment]]
- Concept pages updated: [[Dashboard-UX-Patterns]] (Conflict/superseded note — filter bar removed), [[Supabase-GHL-Mirror]] (migrations 019–021 rows added)
- Updated: [[index]] (raw source row, source note row, 4 new concept rows, 2 updated concept summaries)

## [2026-04-13] synthesis | Backfill bug root cause recorded

- Filed: [[Webinar-Run-Contact-Assignment]]
- Finding: bulk GHL sync (`runGhlFullContactSyncForConnectionId`) never called `backfill_webinar_runs_for_location`, leaving all bulk-imported contacts with `webinar_run_id = null` and invisible to dashboard RPCs.
- Fix applied: `app/api/actions/sync/ghl/route.ts` now calls the backfill RPC per connection after contact sync completes. Manual backfill ran for CAE location (5,061 contacts updated).
- Traffic RPC confirmed: 174 rows returned post-backfill.

## [2026-04-15] ingest | Zoom attendance segments + journey rollup design

- Raw: `raw/sources/2026-04-15-zoom-attendance-segments-journey-design.md` — frozen design: dedicated `zoom_attendance_segments` table, `journey_events` as attended rollup, Show Up binary rule, app-only contacts for mismatched Zoom email, audience curve from segments, cloud recording as optional manual scrub (no graph-to-seek v1).
- Source page: [[Zoom-Attendance-Segments-And-Journey-Design]]
- Concept added: [[Zoom-Attendance-Segments-And-Journey]]
- Updated: [[Buyer-Journey-Event-Store]] (planned evolution section), [[Zoom-Integration-Architecture]] (related link), [[Zoom]] entity (related link), [[index]].

## [2026-04-16] ingest | Zoom attendance implementation shipped (recap)

- Raw: `raw/sources/2026-04-16-zoom-attendance-implementation-shipped.md` — migration **024**, segment upsert + journey rollup upsert, app-only `ghl_contacts`, `nmdapp-` mirror skip, API `segmentsUpserted` / `rollupsUpdated`, CLI script parity; apply DDL before sync.
- Source page added: [[Zoom-Attendance-Implementation-Shipped]]
- Source page updated: [[Zoom-Attendance-Segments-And-Journey-Design]] (implementation status + resolved design questions)
- Concept updated: [[Zoom-Attendance-Segments-And-Journey]] (implemented flow, table roles, history note)
- Concept updated: [[Buyer-Journey-Event-Store]] (Zoom idempotency + segment/rollup section replaces “planned evolution”)
- Entity updated: [[Zoom]]
- Concept updated: [[Supabase-GHL-Mirror]] (migration 024 row in manifest)
- Concept updated: [[Zoom-Integration-Architecture]] (segment ingest status wording)
- Updated: [[index]] (two raw rows, new source row, refreshed concept/entity summaries)
