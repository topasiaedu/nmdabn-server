# Phase 1 execution plan + Zoom / webinar design decisions

- Source type: `session synthesis / decision record`
- Snapshot date: `2026-04-13`
- Context: Planning session after pulling latest repo state (includes `frontend/`, migrations 001–009, traffic dashboard backend and frontend scaffold, wiki bootstrap).

---

## Project status at session start (2026-04-13)

### Backend (Express/TypeScript) — built

- Core Express server, CORS, Helmet, auth middleware
- GHL webhook handler (`POST /api/webhooks/ghl`) — Ed25519 signature verify, raw body
- GHL contacts bulk sync (`npm run sync-ghl-contacts`)
- GHL orders/invoices bulk sync (`npm run sync-ghl-orders-invoices`)
- GHL webhook → Supabase mirror sync service
- Database migrations 001–009 (contacts, tags, custom fields, orders, webinar_runs, traffic RPCs, project settings, custom field catalog)
- Traffic dashboard API (`GET /api/dashboard/traffic`, `/lines`) — occupation + lead source breakdown
- Workspace routes, project routes (incl. GHL settings per project)
- Webinar run assignment service + backfill script
- Flexible auth (Bearer JWT + legacy `x-traffic-key`)

### Backend — gaps identified

- Agency dashboard API — not built
- Buyer behavior dashboard API — not built
- Show up dashboard API — not built
- Zoom attendance ingestion — not built
- `ghl_connections` table (multi-location routing) — designed in wiki, not implemented; still uses global env `GHL_LOCATION_ID`
- `journey_events` table — not built
- CORS production config — placeholder `your-frontend-domain.com` in `src/index.ts`
- Job queue (`integration_jobs`) — incomplete/half-implemented per engineering direction
- Structured logging / request correlation — basic console.log only
- Docker / Render deployment config — not in repo
- VAPI routes still present; engineering direction says VAPI is out of scope

### Frontend (Next.js 15) — early stage

- App Router scaffold, Supabase client, env example
- Traffic dashboard page (`TrafficDashboardPage.tsx`) — sign-in, workspace/project picker, occupation + source breakdown tables
- `BreakdownTable` component, Supabase session hook, API service layer for traffic
- Remaining three dashboards, navigation, layout, date pickers — not built

---

## Key architectural context (from wiki)

### 3-phase product roadmap

- Phase 1: Live sales tracking dashboard + continuous data refresh (current focus)
- Phase 2: GHL automation from our stack (workflows, custom values, Zoom hooks)
- Phase 3: TBD after Phase 2

### Phase 1 — four dashboard surfaces (from CAE sales tracking sheet exports)

1. Traffic — lead occupation + sorted lead source by webinar run
2. Show Up — occupation splits, NM/OM/MISSING, ads source, "showed" %
3. Agency — spend + funnel KPIs by agency line + webinar run column
4. Buyer Behavior — DYD funnel, occupation mix, program/creative dimension

### Existing webinar run assignment model

`webinar_runs` is a manually-maintained date dimension (location_id, display_label, event_start_at, event_end_at). Contacts are assigned a `webinar_run_id` via `assign_next_webinar_run_for_contact`: picks the earliest `event_start_at > contact.date_added` for that location. No Zoom meeting ID is stored anywhere. Webinar runs are currently inserted manually via SQL.

---

## Decision: recommended build order

**Agreed principle:** Do not build dashboards on top of an incomplete data foundation. Dashboards are the last 20% of the work but only trustworthy if everything below is solid.

### Rejected approach

Jumping straight to dashboard UI before multi-project structure is ready and before Zoom data is connected.

### Agreed order

1. Multi-project / multi-location foundation first (everything is scoped by project)
2. Schema updates for Zoom + journey_events
3. Infrastructure hygiene (CORS, VAPI cleanup, job queue decision)
4. Zoom integration (S2S OAuth, participant sync)
5. Admin settings UI (project config, Zoom credentials, webinar run management)
6. SQL RPCs for remaining dashboards
7. Backend API routes for remaining dashboards
8. Frontend layout + remaining dashboard UIs
9. Data refresh pipeline
10. Deployment (Docker, Render)

---

## Decision: Zoom integration approach

### Context

- Each project has its own Zoom account (not one global account)
- Zoom account is used for other purposes (team meetings, client calls, coaching) — not exclusively for sales webinars
- Some projects use the Zoom Webinar product (type=5); some run sales webinars as regular Zoom Meetings (type=2)
- All three other disambiguation options (topic filter, Zoom Webinar product migration, dedicated account per project) were rejected as they interfere with company workflow

### Decision: Option A — explicit Zoom meeting ID on webinar_run record

When a `webinar_run` is created, the operator also pastes the Zoom meeting ID from their Zoom account. The Zoom participant sync only fetches participants for meetings that have an explicit `zoom_meeting_id` set on the `webinar_run` row. This cleanly solves the "mixed use account" problem without requiring any operational changes to how webinars are run.

### Decision: zoom_source_type field required

Since some projects use the Zoom Webinar product and some use regular meetings, the `webinar_runs` row must store which type. Reason: the Zoom API uses completely different endpoints:

- Regular meeting → `GET /v2/report/meetings/{meetingId}/participants`
- Zoom Webinar product → `GET /v2/report/webinars/{webinarId}/participants`

The operator specifies `zoom_source_type` (`meeting` | `webinar`) when creating the webinar run. This is a required field when `zoom_meeting_id` is set.

### Decision: multi-day runs share the same Zoom meeting ID

A multi-day `format='multi_day'` webinar run still has a single `zoom_meeting_id`. No array of IDs needed.

---

## Decision: per-project Zoom credentials

### Decision: zoom_integration_account_id on projects table

Each project links to one `integration_accounts` row where `provider='zoom'`. The `integration_accounts` table already exists and already stores `client_id`, `client_secret`, `account_id` for Zoom (from the existing `POST /api/integrations/accounts/zoom` endpoint). A new FK column `zoom_integration_account_id` on `projects` provides the link.

The Zoom participant sync flow uses this chain: `webinar_run.project_id` → `projects.zoom_integration_account_id` → `integration_accounts` credentials.

### Decision: Server-to-Server (S2S) OAuth

Credentials stored: `client_id`, `client_secret`, `account_id` — exactly the three fields Zoom's S2S OAuth requires. These are already stored in `integration_accounts`. Token exchange: `POST https://accounts.zoom.us/oauth/token?grant_type=account_credentials`. Tokens last 1 hour; the token service must cache per `integration_account_id` to avoid re-exchanging on every request.

### Decision: credentials page in admin UI

A frontend page where the operator pastes Zoom S2S credentials. The page calls `POST /api/integrations/accounts/zoom` (already exists). Before saving, the server should attempt a test token exchange to validate the credentials.

### Security note: client_secret at rest

The `integration_accounts.client_secret` column currently stores values in plaintext. This is a risk for Zoom OAuth app secrets. Decision: encrypt `client_secret` at the application layer (encrypt before insert, decrypt before use in the token service). The encryption approach (AES-256-GCM with a key from env, or Supabase Vault) is an open decision that must be resolved before Zoom credentials go into production.

---

## Decision: Zoom attendance storage — use journey_events

### Rejected: dedicated zoom_participants table

Would be easy to query but separates Zoom data from other event sources; a buyer journey view would require UNION later.

### Decision: journey_events event store

Per wiki guidance ("Phase 1 should fix the schema so a journey UI later is additive, not a rewrite"), Zoom attendance records go into `journey_events` with `source_system = 'zoom'`. Typed columns: `occurred_at`, `contact_id` (FK to `ghl_contacts`), `duration_seconds`, `webinar_run_id`. Full participant payload in `payload` JSONB. "Showed" for dashboards = any `journey_events` row for the contact where `source_system = 'zoom'` and `event_type = 'attended'` exists for the matching `webinar_run_id`.

### journey_events table shape (decided)

- `id` UUID PK
- `occurred_at` TIMESTAMPTZ
- `event_type` TEXT (e.g. `attended`)
- `source_system` TEXT CHECK IN ('ghl', 'zoom', 'web', 'manual')
- `contact_id` TEXT FK → `ghl_contacts.id` (nullable for events before contact resolution)
- `location_id` TEXT (for scoping without always joining)
- `project_id` UUID FK → `projects.id`
- `webinar_run_id` UUID FK → `webinar_runs.id`
- `duration_seconds` INTEGER (typed Zoom column; NULL for non-Zoom events)
- `payload` JSONB (full vendor-specific fields)
- `created_at` TIMESTAMPTZ DEFAULT NOW()

---

## Schema changes required (new migrations)

### Migration 010 — ghl_connections (multi-location)

- `ghl_connections` table: `id`, `project_id` FK, `ghl_location_id`, `api_token` (encrypted), `is_active`, `is_default`, `created_at`, `updated_at`
- Update webhook routing to lookup location from `ghl_connections` by payload `locationId` (keep env fallback for backward compat with warning)

### Migration 011 — journey_events table

- Create `journey_events` as described above

### Migration 012 — extend webinar_runs + projects for Zoom

- `webinar_runs`: add `project_id UUID REFERENCES projects(id)`, `zoom_meeting_id TEXT`, `zoom_source_type TEXT CHECK IN ('meeting', 'webinar')` (nullable; required only when `zoom_meeting_id` is set)
- `projects`: add `zoom_integration_account_id UUID REFERENCES integration_accounts(id)` nullable

---

## Zoom participant sync flow (decided)

```
For each webinar_run WHERE zoom_meeting_id IS NOT NULL:
  1. Get project_id → look up projects.zoom_integration_account_id
  2. Load integration_accounts row → get client_id, client_secret, account_id
  3. Decrypt client_secret
  4. Exchange for Bearer token (POST accounts.zoom.us/oauth/token); cache 1h per account
  5. Based on zoom_source_type:
     - 'meeting'  → GET /v2/report/meetings/{zoom_meeting_id}/participants
     - 'webinar'  → GET /v2/report/webinars/{zoom_meeting_id}/participants
  6. Handle pagination (next_page_token)
  7. For each participant: normalize email (lowercase, trim)
     → look up ghl_contacts.id by email + location_id
  8. Upsert into journey_events (idempotent: keyed on zoom_meeting_id + participant email)
     source_system='zoom', event_type='attended', duration_seconds from participant duration
```

---

## Open decisions (must resolve before the step that needs them)

1. **Ad spend data source** — Agency dashboard needs spend figures (CPL, CPA). Options: manual entry per webinar run, ad platform API import, spreadsheet upload. Blocks Agency SQL RPC + Agency dashboard UI.
2. **"Showed" denominator** — Show Up dashboard: % of total leads, % of registrants, or % of Zoom attendees? Currently assumed = Zoom attended. Needs sign-off.
3. **client_secret encryption approach** — AES-256-GCM with env key, or Supabase Vault. Blocks Zoom credential save going to production.
4. **Webinar run backfill scope** — On new webinar run creation: re-assign only previously unassigned contacts, or recalculate all? Affects UX of webinar run management UI.

---

## Full Phase 1 execution plan (10 steps)

### Step 1 — Multi-project / multi-location foundation

- Migration 010: ghl_connections table
- Update GHL webhook handler to route by location lookup against ghl_connections
- Update sync scripts to accept project/connection context (keep env fallback + warning)
- Update backfill-webinar-runs to accept project_id
- Regenerate database.types.ts

### Step 2 — Schema: Zoom + journey events

- Migration 011: journey_events table
- Migration 012: extend webinar_runs + projects for Zoom
- Regenerate database.types.ts

### Step 3 — Infrastructure hygiene

- Audit integration_accounts RLS; add client_secret encryption
- Fix CORS production placeholder in src/index.ts
- Remove/stub VAPI routes (actions.ts, webhooks.ts)
- Decide on integration_jobs: finish or remove from public API surface

### Step 4 — Zoom integration

- Zoom S2S token service (credential decrypt + exchange + 1h cache per account)
- Zoom participants sync service (meeting + webinar endpoints, pagination, journey_events upsert)
- sync-zoom-participants.mjs script + npm run sync-zoom-participants
- Confirm POST /api/integrations/accounts/zoom scoping + test-exchange validation

### Step 5 — Admin settings UI

- Zoom credentials page (paste S2S keys, test before save)
- Project settings page (ghl_location_id, zoom_integration_account_id, occupation field, agency line tags)
- Webinar run management page (create/edit/deactivate, zoom_meeting_id + zoom_source_type, trigger backfill on save)
- GHL connection page (ghl_connections per project: location_id + token)

### Step 6 — SQL RPCs for remaining dashboards

- Show Up RPC (occupation + showed %, NM/OM/MISSING, ads source, by webinar run; document all denominators in SQL)
- Agency RPC (spend + funnel KPIs by line + webinar run; safe division; blocked by ad spend decision)
- Buyer Behavior RPC (DYD funnel, occupation, program/creative long tail, purchase facts from ghl_orders)

### Step 7 — Backend API routes for remaining dashboards

- GET /api/dashboard/showup
- GET /api/dashboard/agency
- GET /api/dashboard/buyer-behavior
- Workspace membership guard + flex auth on all three

### Step 8 — Frontend: layout + remaining dashboards

- Sidebar/tab nav between all four dashboards
- Shared workspace + project selector, date range picker
- Traffic dashboard polish (multi-location wired, date picker)
- Show Up dashboard UI
- Agency dashboard UI
- Buyer Behavior dashboard UI

### Step 9 — Data refresh pipeline

- Confirm GHL webhooks trigger webinar_run assignment after upsert
- POST /api/actions/zoom/sync-participants endpoint (auth-gated manual trigger)
- Consider Zoom meeting.ended webhook as auto-trigger
- Document refresh cadence in docs/

### Step 10 — Deployment

- Dockerfile for Express server
- Dockerfile (or static config) for Next.js frontend
- render.yaml service definitions, env var references, health check
- Finalize .env.example with all required vars
- Lock CORS to FRONTEND_ORIGIN in production

---

## Phase 1 completion checklist

- All four dashboards live and queryable per project
- GHL contacts syncing continuously (webhooks + scheduled full sync)
- Zoom attendance syncing per webinar run (triggered or automated)
- webinar_run_id assigned on every GHL contact with an active run
- All four SQL RPCs tested against real data matching historical Google Sheet exports
- All per-project settings configurable via UI (no manual SQL inserts by operators)
- Deployed to Render, production CORS locked, no secrets in repo

