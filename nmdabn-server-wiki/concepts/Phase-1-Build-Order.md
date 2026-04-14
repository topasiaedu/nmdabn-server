# Phase 1 build order

## Definition / scope

The agreed execution sequence to reach Phase 1 completion: live sales tracking dashboard (all four surfaces) with continuously refreshed GHL + Zoom data, per-project configuration, and production deployment. Updated 2026-04-13 to reflect the Next.js consolidation decision.

## Core principle

**Do not build dashboards on top of an incomplete data foundation.** Dashboards are the last 20% of the work but only trustworthy if everything below them is solid. The multi-project structure and Zoom data layer must exist before any dashboard SQL or UI is written.

## Data refresh model (why no continuous polling is needed)

GHL and Zoom data is kept in sync via:
1. **Webhooks** — GHL pushes changes in real time; handler verifies + fires async sync (~95–98% coverage)
2. **Daily scheduled full sync** — external Render cron job hits `POST /api/actions/sync/ghl` once a day; reconciles any webhook gaps
3. **Triggered Zoom sync** — after each webinar ends, operator triggers participant pull (or Zoom `meeting.ended` webhook auto-triggers)

No continuous polling loops. No persistent in-process timers. See [[NextJS-Consolidation-Decision]] for full rationale.

---

## Step 1 — Multi-project / multi-location foundation ✅ DONE
**Status:** Completed. Migration 010 applied, webhook routing updated, scripts updated.

Files created: `src/services/ghl-connection-resolve.ts`, `src/services/ghl-connection-token-crypto.ts`, `scripts/lib/`, `docs/database/migrations/010_ghl_connections.sql`.

**Remaining action before moving on:**
- Generate `GHL_CONNECTION_TOKEN_ENCRYPTION_KEY` with `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` and add to `.env`
- Re-run Supabase codegen after migration 010 is applied to the live DB to replace the manually-merged `src/database.types.ts`

---

## Migration Step — Consolidate Express → Next.js ✅ DONE
**Status:** Completed and smoke-tested 2026-04-13. All 8 key routes verified.

**Summary of changes applied:**
- Promoted `frontend/` to project root (`app/`, `src/features/`, `src/lib/` moved up; `frontend/` deleted)
- Converted all `src/routes/*.ts` → `app/api/**/route.ts` Route Handlers
- Refactored Express middleware to plain async helper functions (`src/middleware/`)
- Removed `express`, `cors`, `dotenv`, `helmet` dependencies
- Deleted `src/index.ts`, `src/routes/`
- Merged `package.json`; updated `tsconfig.json` (`@/*` → `src/*`); promoted `next.config.ts`
- `src/features/traffic/services/api.ts` already uses relative `/api/...` paths — no change needed
- Security headers added to `next.config.ts` (X-Frame-Options, X-Content-Type-Options, Referrer-Policy)
- GHL webhook: `export const runtime = "nodejs"` + `Buffer.from(await request.arrayBuffer())`
- Extracted GHL webhook business logic to `src/services/ghl-webhook-post.ts`
- Google OAuth made optional (returns 501 when `GOOGLE_*` vars absent — not needed for Phase 1)

**Post-migration fixes applied (2026-04-13):**
- `.env.example` had a real AES-256 key hardcoded — replaced with placeholder + generation instruction
- `FRONTEND_ORIGIN` / `frontendOrigin` removed (CORS-era remnant, no longer applicable)
- `server.port` removed from `env.ts` (Next.js reads `PORT` natively)
- `GOOGLE_CLIENT_ID/SECRET/REDIRECT_URI` made optional — server now starts without them

**Local dev note:** Windows system/user environment variables were set to empty strings (likely by a previous setup script), which shadow `.env.local` values. These have been cleared. If env vars appear missing after a fresh clone, check `[System.Environment]::GetEnvironmentVariable('SUPABASE_URL', 'User')` in PowerShell and clear any empty stubs.

**Smoke test results (all passing):**
- `GET /api/health` → 200 ✅
- `POST /api/webhooks/ghl` (unknown event type) → 200 ignored ✅
- `GET /api/projects` (no auth) → 401 ✅
- `GET /api/workspaces` (no auth) → 401 ✅
- `GET /api/dashboard/traffic` (no auth) → 400 (missing workspace_id — auth layer passed) ✅
- `GET /api/auth/google/authorize` (no Google config) → 501 ✅
- `GET /api/integrations/accounts` (no auth) → 401 ✅

---

## Step 2 — Schema: Zoom + journey events ✅ DONE
**Status:** Completed and live-DB verified 2026-04-13.

**Applied:**
- Migration 011: `journey_events` table — all columns, 3 indexes, RLS + user-scoped policies (see [[Buyer-Journey-Event-Store]])
- Migration 012: `webinar_runs.project_id`, `webinar_runs.zoom_meeting_id`, `webinar_runs.zoom_source_type` (CHECK constraint), `projects.zoom_integration_account_id`; also ensures `integration_accounts` table + `integration_provider` enum exist idempotently (see [[Webinar-Run-Zoom-Linkage]])
- `src/database.types.ts` regenerated from live DB via Supabase CLI
- `supabase/config.toml` created (Supabase CLI local config; project_id = `nmdabn-server`)
- TypeScript: 0 errors after regeneration

**Smoke tests (all passing against live Supabase):**
- `journey_events` INSERT + DELETE ✅
- `webinar_runs` INSERT with `project_id`, `zoom_meeting_id`, `zoom_source_type` ✅
- `projects` UPDATE with `zoom_integration_account_id = null` ✅

**Minor note:** migration 011 service_role bypass policy added to file for consistency with migration 010 style. Functionally a no-op — service role key bypasses RLS automatically in Supabase. Apply via Supabase dashboard SQL editor if you want the live policy to match exactly.

---

## Step 3 — Infrastructure hygiene ✅ DONE
**Status:** Completed and smoke-tested 2026-04-13.

**Applied:**
- Migration 013: `integration_accounts.client_secret` → `client_secret_encrypted`, `api_secret` → `api_secret_encrypted`; RLS enabled with service_role bypass + workspace membership policies
- `src/services/ghl-connection-token-crypto.ts` reused for Zoom secret encryption (no new crypto file)
- `app/api/integrations/accounts/zoom/route.ts` — encrypts `client_secret` with AES-256-GCM before INSERT; `export const runtime = "nodejs"`
- `src/lib/integration-accounts-api.ts` — centralized `INTEGRATION_ACCOUNT_SAFE_RESPONSE_COLUMNS` constant; all 4 integration account routes use it (never returns encrypted columns)
- `src/config/env.ts` — `GHL_CONNECTION_TOKEN_ENCRYPTION_KEY` validated at startup; `encryptionKeyLoaded: boolean` added to `EnvConfig`; logs `console.warn` if missing (non-fatal — server starts, individual operations fail gracefully)
- `app/api/jobs/route.ts` + `app/api/jobs/[id]/route.ts` — both stubbed to `501 "Job queue not yet implemented"`
- `src/database.types.ts` regenerated (new column names reflected)
- TypeScript: 0 errors

**Smoke tests:**
- `GET /api/jobs` → 501 ✅
- `GET /api/jobs/:id` → 501 ✅
- `GET /api/integrations/accounts` (no auth) → 401 ✅
- `POST /api/integrations/accounts/zoom` (no auth) → 401 ✅
- `integration_accounts.client_secret_encrypted` column exists, old `client_secret` gone ✅
- Anon read of `integration_accounts` blocked by RLS ✅

**Pre-existing note:** Anon RLS on `integration_accounts` blocks with "infinite recursion detected in policy for relation workspace_members". This is a pre-existing Supabase RLS recursion issue affecting all workspace-scoped tables — security is maintained (no data leaks), but the error message is misleading. Resolve in a later migration by flattening the `workspace_members` sub-select to a security-definer function.

---

## Step 4 — Zoom integration ✅ DONE
**Status:** Completed and smoke-tested 2026-04-13.

**Applied:**
- `src/services/zoom-token.ts` — S2S OAuth token exchange (`exchangeZoomAccountCredentials`); in-memory bearer cache keyed by `integration_account_id` (5-min safety margin, 1-min minimum TTL)
- `src/services/zoom-participants-sync.ts` — paginated Zoom Reports API call (`/report/meetings/:id/participants` or `/report/webinars/:id/participants`); select-first idempotency per email per run; batched INSERT in chunks of 100; resolves `contact_id` by `email + location_id` from `ghl_contacts`; inserts into `journey_events` with `source_system = 'zoom'`
- `scripts/sync-zoom-participants.mjs` — MJS mirror of the TypeScript service; same logic, no TS import; flags: `--webinar-run-id=<uuid>`; `npm run sync-zoom-participants`
- `app/api/actions/sync/zoom/route.ts` — auth-gated `POST` endpoint that triggers participant sync for a given `webinar_run_id`; double-checks workspace ownership of the webinar run's project; same 404 for missing run and cross-workspace runs (no existence leakage); 503 if encryption key not loaded
- `app/api/integrations/accounts/zoom/route.ts` updated — live Zoom token exchange before INSERT validates credentials at save time (400 with Zoom error message if rejected)
- `package.json` — `sync-zoom-participants` script added

**Design choices (Phase 1):**
- Manual trigger only (`app/api/actions/sync/zoom/`); no Zoom webhook for `meeting.ended` — simpler for Phase 1, no Zoom app approval required. Add in Step 9 if automation is needed.
- Idempotency via select-first per participant email rather than a unique DB constraint — fine for Phase 1 (Zoom runs are infrequent, not streaming). A unique index on `(webinar_run_id, payload->>'user_email')` should be added in a future migration if re-runs become frequent.
- Both `meeting` and `webinar` source types handled via `zoom_source_type` on the `webinar_run` row (set by operator at run creation).

**Smoke tests (all passing):**
- `POST /api/actions/sync/zoom` (no auth) → 401 ✅
- `POST /api/integrations/accounts/zoom` (no auth) → 401 ✅
- `payload->>user_email` JSON filter syntax validated against live Supabase DB ✅
- TypeScript: 0 errors ✅

---

## Step 5 — Admin settings UI ✅ DONE
**Status:** Completed and smoke-tested 2026-04-13.

**Applied:**
- `app/api/projects/[id]/route.ts` — PATCH handler extended with `zoom_integration_account_id` (same nullable-string pattern as `ghl_location_id`)
- `app/api/projects/[id]/connections/ghl/route.ts` — `GET` (list safe columns) + `POST` (encrypt token, INSERT, return safe columns); workspace ownership check before any DB write; 503 if encryption key missing
- `app/api/webinar-runs/route.ts` — `GET` (all runs for workspace via project_id IN subquery) + `POST` (full validation: required fields, ISO timestamp parsing, zoom_source_type enum check, workspace ownership of project_id)
- `app/api/webinar-runs/[id]/route.ts` — `GET` + `PATCH` (all fields optional, re-validates zoom_source_type, re-verifies project workspace ownership if project_id changes) + `DELETE` (workspace ownership guard)
- `src/lib/settings-api.ts` — `getAuthHeaders()` reads `auth_token` + `workspace_id` from localStorage; SSR-safe (returns `{}` when `window` is undefined)
- `app/settings/page.tsx` — index page; loads + lists projects with per-project links; links to Zoom and Webinar Runs sections
- `app/settings/zoom/page.tsx` — list accounts, create form (display_name, client_id, client_secret, account_id, is_default), delete per-account
- `app/settings/projects/[id]/page.tsx` — edit all project fields including `zoom_integration_account_id` (dropdown of workspace Zoom accounts); GHL connections section (list + create form with encrypted token)
- `app/settings/webinar-runs/page.tsx` — full CRUD table: create, inline edit, activate/deactivate toggle, delete with `window.confirm`; zoom_source_type as dropdown

**Smoke tests (all passing):**
- All 7 new API routes → 401 without auth ✅
- `ghl_connections` safe-column select valid against live DB ✅
- `webinar_runs` INSERT with invalid FK rejects with DB error (schema constraints intact) ✅
- `projects.zoom_integration_account_id` column confirmed readable ✅
- TypeScript: 0 errors, 0 lint warnings ✅

---

## Step 6 — SQL RPCs for remaining dashboards ✅ DONE
**Status:** Completed and applied to live DB 2026-04-13.

**Applied:**
- `docs/database/migrations/014_showup_rpc.sql` — `get_showup_stats(p_workspace_id, p_project_id, p_webinar_run_id, p_date_from, p_date_to)`. Returns one row per bucket (NM / OM / MISSING) with `denominator`, `numerator`, `showup_rate`. All 3 buckets always returned (LEFT JOIN on `unnest` constant). Safe division (NULL when denom=0). Guard join makes invalid workspace/project/run return 0 rows. `SECURITY DEFINER`, `SET search_path = public`, `LANGUAGE SQL STABLE`.
- `docs/database/migrations/015_buyer_behavior_rpc.sql` — `get_buyer_behavior_stats(...)`. Returns multi-section rows (`section`, `label`, `sort_key`, `bigint_val`, `numeric_val`, `pct`). Sections: `dyd` (Full / Deposit / Installment / Total student pax), `dyd_closing` (NULL placeholder — closing session not yet modeled), `occupation`, `program` (first-touch `utm_campaign`), `purchase` (order_count, distinct_buyers, sum_paid_amount, sum_total_amount). Safe division on occupation/program pct.
- `docs/database/migrations/016_agency_rpc.sql` — `get_agency_stats(...)`. Returns one row per agency line key from `traffic_agency_line_tags`. Columns: `agency_line`, `webinar_run_id`, `run_label`, `leads`, `showed`, `showup_rate`, `buyers`, `conversion_rate`, `ad_spend` (NULL — open decision), `cpl` (NULL), `cpa` (NULL). Returns 0 rows if project has no `traffic_agency_line_tags` configured. Safe division.

**All functions:** `GRANT EXECUTE` to `authenticated` and `service_role`.

**Smoke tests (all passing):**
- All three RPCs exist in live DB ✅
- Guard check with all-zero UUIDs → 0 rows (no data leak) ✅
- All referenced columns confirmed in live DB: `ghl_contact_attributions.is_first/position`, `ghl_contact_custom_field_values.field_id/field_value`, `ghl_order_line_items.name`, `ghl_contacts.date_added/synced_at/webinar_run_id`, `ghl_orders.paid_amount/total_amount` ✅

**Known stubs (by design):**
- `dyd_closing` rows return NULL — no "closing session" source in schema yet; TODO in SQL comment
- `ad_spend`, `cpl`, `cpa` in agency RPC return NULL — open decision per [[Phase-1-Open-Decisions]]

---

## Step 7 — API Route Handlers for remaining dashboards ✅ DONE
**Status:** Completed and smoke-tested 2026-04-13.

**Applied:**
- `app/api/dashboard/showup/route.ts` — `GET`; calls `get_showup_stats` RPC; required params: `project_id`, `webinar_run_id`; optional: `date_from`, `date_to`
- `app/api/dashboard/agency/route.ts` — `GET`; calls `get_agency_stats` RPC; same params
- `app/api/dashboard/buyer-behavior/route.ts` — `GET`; calls `get_buyer_behavior_stats` RPC; same params
- `src/lib/parse-date-param.ts` — shared `parseOptionalIsoDateParam` utility (extracted from the three routes; eliminates code duplication)

**All routes:** `export const runtime = "nodejs"`, `requireAuthAndWorkspace` guard, RPC called with `session.workspaceId` (not the user-supplied query param), generic error message on RPC failure, raw Supabase errors never exposed to client.

**Smoke tests (all passing):**
- All three routes → 401 without auth ✅
- TypeScript: 0 errors ✅

---

## Step 8 — Frontend: layout + remaining dashboards ✅ DONE
**Status:** Completed 2026-04-13.

**Applied:**
- `app/layout.tsx` — updated to include `<NavTabs />` and `<main>` wrapper; metadata updated to "NMDABN dashboards"
- `src/components/NavTabs.tsx` — `"use client"` tab nav (Traffic / Show Up / Agency / Buyer Behavior); uses `usePathname` to highlight the active tab
- `src/components/DashboardContext.ts` — shared `DashboardContext` type (`accessToken`, `workspaceId`, `projectId`, `webinarRunId`, `dateFrom`, `dateTo`)
- `src/components/DashboardShell.tsx` — shared `"use client"` shell; handles login form, workspace/project/webinar-run selectors, date range inputs; persists `auth_token`, `workspace_id`, `project_id` to localStorage for settings pages; render-prop API: `children: (ctx: DashboardContext) => React.ReactNode`
- `src/features/traffic/TrafficDashboardPage.tsx` — refactored to use `DashboardShell`; workspace/project/auth state removed from component, received via context; traffic-specific `line` selector retained
- `src/features/traffic/types/index.ts` — `WebinarRunListItem` type added
- `src/features/traffic/services/api.ts` — `fetchWebinarRuns` added (calls `GET /api/webinar-runs`)
- `src/features/showup/` — `types/index.ts`, `services/api.ts`, `ShowUpDashboardPage.tsx`; table: Line / Leads / Showed / Show-up %
- `src/features/agency/` — `types/index.ts`, `services/api.ts`, `AgencyDashboardPage.tsx`; table: Line / Leads / Showed / Show-up % / Buyers / Conversion % / Ad Spend (—) / CPL (—) / CPA (—)
- `src/features/buyer-behavior/` — `types/index.ts`, `services/api.ts`, `BuyerBehaviorDashboardPage.tsx`; groups rows by `section`, renders each as a sub-table sorted by `sort_key`
- `app/showup/page.tsx`, `app/agency/page.tsx`, `app/buyer-behavior/page.tsx` — page entry points

**Fix applied during review:**
- `postcss.config.mjs` — updated from `tailwindcss: {}` (v3 plugin) to `"@tailwindcss/postcss": {}` (v4 package); `autoprefixer` removed (not needed in v4)
- `app/globals.css` — `@tailwind base/components/utilities` replaced with `@import "tailwindcss"` (v4 syntax)
- `@tailwindcss/postcss` installed as devDependency

**Smoke tests (all passing after fix):**
- TypeScript: 0 errors ✅
- 0 lint warnings ✅
- `GET /` → 200 with HTML + nav ✅
- `GET /showup` → 200 with HTML + nav ✅
- `GET /agency` → 200 with HTML + nav ✅
- `GET /buyer-behavior` → 200 with HTML + nav ✅

---

## Step 9 — Data refresh pipeline ✅ DONE
**Status:** Completed and smoke-tested 2026-04-13.

**Applied:**
- `app/api/actions/sync/ghl/route.ts` — `POST`; auth-gated; resolves all active `ghl_connections` rows for the workspace's projects; calls `runGhlFullContactSyncForConnectionId` + `runGhlFullOrdersInvoicesSyncForConnectionId` (from `src/services/ghl-webhook-sync.ts`) sequentially per connection; returns `{ success: true, triggered: N }`; 503 if encryption key not loaded

**Already in place from earlier steps:**
- GHL webhooks → `assign_next_webinar_run_for_contact` wired in `app/api/webhooks/ghl/route.ts` ✅
- `app/api/actions/sync/zoom/route.ts` — manual Zoom participant sync (Step 4) ✅

**Still to do (Render config — Step 10):**
- Configure Render cron job to `POST /api/actions/sync/ghl` daily with a service-role-level auth header

**Smoke tests:**
- `POST /api/actions/sync/ghl` no body → 400 (body parser fires before auth — expected) ✅
- `POST /api/actions/sync/ghl` with body, fake token → 401 ✅
- TypeScript: 0 errors ✅

---

## Step 10 — Deployment ✅ DONE
**Status:** Completed 2026-04-13.

**Applied:**
- `Dockerfile` — multi-stage build (node:22-alpine builder + runner); copies `.next/standalone`, `.next/static`, `public/`, `scripts/`; `PORT=3000`, `HOSTNAME=0.0.0.0`; `output: "standalone"` already set in `next.config.ts`
- `.dockerignore` — excludes `.git`, `.env*` (except `.env.example`), `node_modules`, `.next`, `nmdabn-server-wiki`, `docs`
- `render.yaml` — `web` service (Docker, health check `/api/health`, all required env var stubs); `cron` service (`nmdabn-ghl-daily-sync`, `0 2 * * *` UTC, calls `POST /api/actions/sync/ghl` via inline node script)
- `.env.example` — finalised with all vars introduced across all 10 steps; Google OAuth and legacy single-location vars commented out (optional); Render cron vars documented

**Production checklist before first deploy:**
1. Set all required env vars in Render web service dashboard (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `GHL_CONNECTION_TOKEN_ENCRYPTION_KEY`)
2. Set cron service vars (`SYNC_HOST`, `SYNC_BEARER_TOKEN`, `SYNC_WORKSPACE_ID`, plus the same Supabase + encryption vars)
3. Add Zoom credentials via `/settings/zoom` UI after first deploy (stored encrypted in DB)

---

## Phase 1 completion checklist

- All four dashboards live and queryable per project
- GHL contacts syncing continuously (webhooks + daily scheduled full sync)
- Zoom attendance syncing per webinar run (triggered or via `meeting.ended` webhook)
- `webinar_run_id` assigned on every GHL contact with an active run
- All four SQL RPCs tested against historical Google Sheet exports
- All per-project settings configurable via UI (no manual SQL inserts by operators)
- Deployed to Render, production CORS removed, no secrets in repo

---

## Related

- [[NextJS-Consolidation-Architecture]] — full migration instructions
- [[NextJS-Consolidation-Decision]] — rationale
- [[Phase-1-Execution-Plan-And-Zoom-Design]] — original plan (pre-migration decision)
- [[Phase-1-Open-Decisions]] — four unresolved decisions
- [[Zoom-Integration-Architecture]]
- [[Webinar-Run-Zoom-Linkage]]
- [[GHL-Multi-Location-Architecture]]
- [[Buyer-Journey-Event-Store]]
- [[Platform-Engineering-Direction]]
- [[Product-Phase-Roadmap]]
- [[Sales-Tracking-Dashboard-Model]]
