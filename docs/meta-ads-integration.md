# Meta Ads Integration

Automated ad spend sync from Meta (Facebook/Instagram) Ads into Supabase, feeding CPL and CPA figures into the Agency dashboard.

## Why this exists

The Agency dashboard (`get_agency_stats` / `get_agency_all_runs` RPCs) calculates CPL (cost per lead) and CPA (cost per acquisition) per agency line per webinar run. These are currently hardcoded as `NULL` — see the `TODO` comment in `docs/database/migrations/016_agency_rpc.sql` and the open decision in `nmdabn-server-wiki/concepts/Phase-1-Open-Decisions.md` (decision #1: "ad spend data source").

This integration resolves that decision: pull ad spend from the Meta Marketing API, attribute it to webinar runs, and expose it through the existing RPCs.

---

## Account structure

- Each client project (e.g. CAE, Dr Jasmine) has **multiple agency lines** (e.g. OM, MB, NM).
- Each agency line has its **own Meta Ad Account** operated by that agency.
- One project can therefore have 2–4 separate Meta Ad Accounts contributing to its total spend.
- We register **one Meta App** (in NM Media's Business account). Agencies authorise our app via OAuth and we store their tokens — they do not grant us a "System User" in their account.

---

## Data architecture (three layers)

### Layer 1 — Raw mirror tables (migration `025`)

Mirrors Meta API data using Meta's own schema, the same way `ghl_contacts` mirrors GHL data.

| Table | Mirrors | Raw JSON? |
|-------|---------|-----------|
| `meta_campaigns` | Meta campaign objects | Yes (`raw_json`) |
| `meta_insights` | Daily spend/impression/click rows per campaign | Yes (`raw_json`) |

`meta_insights` is the core table. It stores one row per `(integration_account_id, campaign_id, date_start)` — daily granularity — so we can compute spend over any arbitrary date window without re-fetching from Meta.

> **Design principle (from `docs/data-sync-principles.md`):** Mirror with typed columns first, `raw_json` as a full-payload safety net — not the other way around.

### Layer 2 — Attribution mapping (also migration `025`)

New table: **`project_meta_ad_accounts`**

Answers the question: *"For project X, which Meta ad account contributes spend to agency line Y?"*

One row per `(project_id, agency_line, integration_account_id)`. `agency_line` must match a key in `projects.traffic_agency_line_tags` (e.g. `"OM"`, `"MB"`, `"NM"`).

A single project will have multiple rows here — one per agency line that has connected a Meta Ad Account.

### Layer 3 — Derived spend attribution (migration `026`)

New table: **`ad_spend_run_attribution`**

Built by the sync service after each raw mirror update. Stores the resolved spend per `(project_id, webinar_run_id, agency_line)`. This is what the Agency RPCs query.

**Attribution method: date overlap (Option A)**

For each webinar run, the attribution window is:

```
window_from = COALESCE(spend_date_from, event_start_at)     -- from webinar_runs
window_to   = COALESCE(spend_date_to,   next_run.event_start_at OR NOW())
```

All `meta_insights` rows for the linked Meta ad account where `date_start >= window_from AND date_start < window_to` are summed as that run's spend for that agency line.

`spend_date_from` and `spend_date_to` (`TIMESTAMPTZ`, nullable) are new columns added to `webinar_runs` so operators can override the default window per run.

Recomputation is triggered by a Postgres function `recompute_meta_spend_attribution(p_project_id UUID)` called at the end of every sync.

---

## OAuth flow

Meta uses standard OAuth 2.0. We register one Meta App in the NM Media Business account.

**Flow:**
1. Operator clicks "Connect Meta Ad Account" in the Settings UI for a project.
2. UI calls `GET /api/auth/meta/authorize?workspace_id=…&project_id=…&agency_line=…`
3. Server redirects to Meta OAuth dialog requesting `ads_read` + `read_insights` scopes.
4. Meta redirects to `GET /api/auth/meta/callback?code=…&state=…`
5. Server exchanges code for a short-lived token, then exchanges that for a **long-lived user token** (~60 days).
6. Server calls `/me/adaccounts` to list the user's ad accounts, then stores the token in `integration_accounts` (`provider = meta_ads`).
7. Server creates a row in `project_meta_ad_accounts` linking the new account to the project + agency line from `state`.

**Token refresh:**  
Long-lived tokens expire in ~60 days. `src/services/meta-oauth-token.ts` checks `expires_at` before every API call and refreshes via the Meta token refresh endpoint when within 7 days of expiry — same pattern as `src/services/zoom-token.ts`.

**Env vars required:**

| Variable | Purpose |
|----------|---------|
| `META_APP_ID` | Meta App ID (from Meta Developer portal) |
| `META_APP_SECRET` | Meta App Secret (same) |
| `META_REDIRECT_URI` | `https://<your-host>/api/auth/meta/callback` |

These follow the same env pattern as `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_REDIRECT_URI` already in `src/config/env.ts`.

---

## Sync flow

`POST /api/actions/sync/meta-ads` with body `{ "project_id": "<uuid>" }`

1. Auth + workspace check (same middleware as all other sync routes).
2. Load all `project_meta_ad_accounts` rows for the project.
3. For each agency line mapping:
   a. Resolve a valid access token via `getMetaAccessToken()` (refresh if near expiry).
   b. Fetch all campaigns for the ad account → upsert `meta_campaigns`.
   c. Fetch daily insights for a rolling lookback window (default: 90 days, configurable) → upsert `meta_insights`.
4. Call `recompute_meta_spend_attribution(project_id)` once after all accounts are synced.
5. Return counters: `{ campaignsUpserted, insightRowsUpserted, runsAttributed }`.

Per-account failures do not abort the full sync — same pattern as the Zoom project-level sync in `app/api/actions/sync/zoom/route.ts`.

**Render cron job:**  
A Render cron service calls `POST /api/actions/sync/meta-ads` daily for each active project. Same pattern as the existing GHL sync cron documented in `docs/README.md`.

---

## Agency dashboard impact

After migrations `025`, `026`, and `027` are applied and at least one sync has run:

- `get_agency_stats(...)` returns real `ad_spend`, `cpl`, `cpa` values instead of `NULL`.
- `get_agency_all_runs(...)` gains `ad_spend`, `cpl`, `cpa` columns (not present today).
- Currency is returned as-is (the native currency of each ad account — USD, MYR, AUD, etc.). Currency normalisation (to a single base currency) is a future enhancement.

---

## Migration plan

| Migration | File | Purpose |
|-----------|------|---------|
| `025` | `025_meta_ads_mirror.sql` | Add `meta_ads` to `integration_provider` enum; create `meta_campaigns`, `meta_insights`, `project_meta_ad_accounts`; add `spend_date_from` / `spend_date_to` to `webinar_runs`; RLS policies |
| `026` | `026_meta_spend_attribution.sql` | Create `ad_spend_run_attribution`; create `recompute_meta_spend_attribution()` Postgres function |
| `027` | `027_agency_rpc_with_spend.sql` | Replace `NULL` spend in `get_agency_stats` and `get_agency_all_runs` with joins to `ad_spend_run_attribution`; add spend columns to `get_agency_all_runs` return type |

Apply in order in the Supabase SQL Editor. Regenerate `src/database.types.ts` after applying all three.

---

## New source files

| File | Purpose |
|------|---------|
| `src/services/meta-oauth-token.ts` | Resolve + refresh Meta access token (checks `expires_at`, calls refresh endpoint, updates `integration_accounts`) |
| `src/services/meta-ads-sync.ts` | Core sync: fetch campaigns + daily insights from Graph API, upsert raw mirror, call recompute function |
| `app/api/auth/meta/authorize/route.ts` | OAuth entry: builds Meta authorisation URL with `state` and redirects |
| `app/api/auth/meta/callback/route.ts` | OAuth callback: exchange code → long-lived token, fetch ad accounts, store in DB |
| `app/api/actions/sync/meta-ads/route.ts` | Sync trigger: POST `{ project_id }`, auth + workspace guard, delegates to sync service |

---

## Settings UI changes

Per-project Settings page gains a **"Meta Ads"** tab (under Integrations, alongside the existing Zoom tab):

- List of connected Meta Ad Accounts for this project (agency line + account display name + last sync time).
- "Connect Meta Ad Account" button per agency line → starts OAuth flow.
- "Sync Now" button → calls `POST /api/actions/sync/meta-ads`.
- Per-run spend window overrides (`spend_date_from` / `spend_date_to`) editable from the Webinar Runs list UI.

---

## Currency

Ad spend is stored in the native currency of each Meta Ad Account (`meta_insights.currency`). The `ad_spend_run_attribution` table carries the currency through. The Agency dashboard displays it with the currency code. Multi-currency normalisation (e.g. to USD) is a Phase 2 enhancement.

---

## Related

- `docs/database/migrations/016_agency_rpc.sql` — current Agency RPC (spend is NULL today)
- `docs/database/migrations/020_all_runs_rpcs.sql` — all-runs Agency RPC (no spend columns today)
- `docs/data-sync-principles.md` — dual-layer mirror philosophy (typed columns + `raw_json`)
- `nmdabn-server-wiki/concepts/Phase-1-Open-Decisions.md` — decision #1 this resolves
- `nmdabn-server-wiki/concepts/Sales-Tracking-Dashboard-Model.md` — four dashboard surfaces
- `src/services/zoom-token.ts` — reference pattern for token resolver
- `app/api/auth/google/authorize/route.ts` + `callback/route.ts` — reference pattern for OAuth routes
- `app/api/actions/sync/zoom/route.ts` — reference pattern for sync API route
